import aiosmtplib
import email.message
import logging
from email.headerregistry import Address, AddressHeader
from typing import Any, Optional

logger = logging.getLogger(__name__)

from critic import api
from critic import pubsub
from critic.extension import Message, Subscription


def generate_address(display_name: str, addr_spec: str) -> str:
    if '"' in display_name:
        return addr_spec
    return f'"{display_name}" <{addr_spec}>'


async def resolve_addresses(
    critic: api.critic.Critic, original: Optional[AddressHeader]
) -> str:
    if original is None:
        return ""

    resolved = []

    for address in original.addresses:
        if address.domain:
            # Entry is a complete email address, so use as-is.
            resolved.append(str(address))
            continue

        # Entry has an address specification without a domain part. We take this
        # as a Critic user reference (by name), and resolve it by looking up the
        # user's selected primary email address. If they don't have one, we skip
        # the recipient.

        try:
            user = await api.user.fetch(critic, name=address.username)
        except api.user.InvalidName as error:
            logger.warning("Failed to resolve address %s: %s", address, error)
            continue

        user_email = await user.email
        if not user_email:
            logger.debug("user %r as no selected primary email address", user)
            continue

        resolved.append(
            generate_address(address.display_name or user.fullname, user_email)
        )

    return ", ".join(resolved)


async def handle_message(
    smtp: aiosmtplib.SMTP, critic: api.critic.Critic, message: Message
) -> None:
    assert isinstance(message.payload, email.message.EmailMessage)
    email_message = message.payload

    publish_messages = []

    try:
        if "message-id" in email_message["message-id"]:
            logger.info("Message-Id: %s", email_message["message-id"])
            message_id = email_message["message-id"]
        else:
            message_id = None

        def feedback(*, sent: bool, **extra: Any) -> None:
            if message_id is None:
                return
            publish_messages.append(
                pubsub.PublishMessage(
                    pubsub.ChannelName("email/sent"),
                    pubsub.Payload({"message_id": message_id, "sent": sent, **extra}),
                )
            )

        logger.info("Subject: %s", email_message["subject"])

        resolved_to = await resolve_addresses(critic, email_message["to"])
        resolved_cc = await resolve_addresses(critic, email_message["cc"])

        if not resolved_to and not resolved_cc:
            logger.info("- no recipients")
            feedback(sent=False, reason="zero resolved recipients")
            return

        if resolved_to:
            email_message.replace_header("to", resolved_to)
            for address in email_message["to"].addresses:
                logger.info("To: %s", address)
        else:
            del email_message["to"]

        if resolved_cc:
            email_message.replace_header("cc", resolved_cc)
            for address in email_message["cc"].addresses:
                logger.info("Cc: %s", address)
        else:
            del email_message["cc"]

        try:
            await smtp.send_message(email_message)
        except aiosmtplib.SMTPRecipientsRefused as error:
            recipients = []
            for nested_error in error.recipients:
                recipients.append(nested_error.recipient)
            logger.error("- recipients refused: %s", ", ".join(recipients))
            feedback(sent=False, reason="recipients refused", recipients=recipients)
        except aiosmtplib.SMTPException as error:
            logger.error("- failed to send message: %s", error)
            feedback(sent=False, reason="error", error=str(error))
        else:
            logger.info("- sent")
            feedback(sent=True)
    finally:
        if publish_messages:
            await pubsub.publish(critic, "email-delivery/outgoing", *publish_messages)


async def main(critic: api.critic.Critic, subscription: Subscription) -> None:
    settings = await api.systemsetting.get(critic, prefix="smtp")

    hostname = settings["smtp.address.host"]
    assert isinstance(hostname, str)

    port = settings["smtp.address.port"]
    assert isinstance(port, int)

    async with aiosmtplib.SMTP(hostname=hostname, port=port) as smtp:
        logger.info("Connected to %s:%d", hostname, port)

        async for message_handle in subscription.messages:
            async with message_handle as message:
                await handle_message(smtp, critic, message)
