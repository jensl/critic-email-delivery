import asyncio
import email.message
import logging
from typing import Any, Mapping, Optional, TypedDict, cast

logger = logging.getLogger(__name__)

from critic import api
from critic.extension import Endpoint, Request
from critic.extension.endpoint import HTTPBadRequest, HTTPNoContent
from critic import pubsub


class DeliveryNotification(pubsub.MessageCallback):
    def __init__(self):
        self.__future: "asyncio.Future[pubsub.Message]" = (
            asyncio.get_running_loop().create_future()
        )

    async def __call__(
        self, channel_name: pubsub.ChannelName, message: pubsub.Message, /
    ) -> None:
        self.__future.set_result(message)

    async def wait(self) -> pubsub.Message:
        return await self.__future


class Feedback(TypedDict):
    sent: bool
    reason: str
    error: str


async def send_email(critic: api.critic.Critic, request: Request, sender: str) -> None:
    if request.method != "POST":
        raise HTTPBadRequest("Expected method: POST")

    payload = cast(Mapping[str, Any], await request.json())
    if not isinstance(cast(object, payload), dict):
        raise HTTPBadRequest(f"Invalid payload: must be object (got: {payload!r})")

    recipient = payload.get("recipient")
    if not isinstance(recipient, str):
        raise HTTPBadRequest(
            f"Invalid payload['recipient']: must be string (got: {recipient!r})"
        )

    subject = payload.get("subject")
    if not isinstance(subject, str):
        raise HTTPBadRequest(
            f"Invalid payload['subject']: must be string (got: {subject!r})"
        )

    message_id = payload.get("message_id")
    if message_id is not None and not isinstance(message_id, str):
        raise HTTPBadRequest(
            f"Invalid payload['message_id']: must be string (got: {subject!r})"
        )

    api.PermissionDenied.raiseUnlessAdministrator(critic)

    feedback: Optional[Feedback] = None

    async with pubsub.connect("EmailDelivery/send_email") as pubsub_client:
        delivery_notification: Optional[DeliveryNotification] = None

        message = email.message.EmailMessage()
        message["From"] = sender
        message["To"] = recipient
        message["Subject"] = subject
        if message_id is not None:
            message["Message-Id"] = f"<{message_id}>"

            delivery_notification = DeliveryNotification()
            await pubsub_client.subscribe(
                pubsub.ChannelName(f"email/sent/{message_id}"), delivery_notification
            )
        message.set_content(await request.text())

        async with critic.transaction() as cursor:
            await pubsub_client.publish(
                cursor,
                pubsub.PublishMessage(
                    pubsub.ChannelName("email/outgoing"), pubsub.Payload(message)
                ),
            )

        if delivery_notification:
            try:
                feedback = cast(
                    Feedback,
                    (await asyncio.wait_for(delivery_notification.wait(), 10)).payload,
                )
            except asyncio.TimeoutError as error:
                feedback = {
                    "sent": False,
                    "reason": "Timeout waiting for delivery notification",
                    "error": str(error),
                }

    if feedback is None:
        raise HTTPNoContent
    else:
        await request.json_response(payload=feedback)


async def main(critic: api.critic.Critic, endpoint: Endpoint) -> None:
    sender = await api.systemsetting.get(critic, "system.email")

    if sender:
        assert isinstance(sender, str)
    else:
        hostname = await api.systemsetting.get(critic, "system.hostname")
        assert isinstance(hostname, str)

        sender = f"critic@{hostname}"

    async for request_handle in endpoint.requests:
        async with request_handle as request:
            await send_email(critic, request, sender)
