import React, { useState } from "react"

import MuiTextField from "@material-ui/core/TextField"
import Button from "@material-ui/core/Button"
import { makeStyles } from "@material-ui/core/styles"

import FormGroup from "../../components/Form.Group"
import SaveOrReset from "../../components/Settings.Buttons.SaveOrReset"
import Section from "../../components/Settings.System.Section"
import TextField from "../../components/Settings.System.TextField"
import Checkbox from "../../components/Settings.System.Checkbox"
import useConnectedControls from "../../utils/ConnectedControls"
import { showToast } from "../../actions/uiToast"
import { useResource, useSignedInUser } from "../../utils"
import { useCritic } from "../../extension"
import { useDispatch } from "../../store"

const useStyles = makeStyles((theme) => ({
  flex: { display: "flex" },
  hostname: { margin: theme.spacing(1), flexGrow: 3 },
  port: { margin: theme.spacing(1), flexGrow: 1 },
  recipient: { margin: theme.spacing(1), flexGrow: 1 },
  send: { margin: theme.spacing(1), flexGrow: 0 },
}))

const SettingsPanel: React.FunctionComponent<{}> = () => {
  const classes = useStyles()
  const dispatch = useDispatch()
  const critic = useCritic()
  const {
    isModified,
    isSaving,
    save,
    reset,
    connectedControlProps,
  } = useConnectedControls()

  const signedInUser = useSignedInUser()
  const email = useResource("useremails", (useremails) =>
    useremails.get(signedInUser?.email ?? -1),
  )
  const [recipient, setRecipient] = useState<string>(email?.address ?? "")

  const sendTestMessage = () => {
    critic
      .fetch("send-email", {
        method: "POST",
        json: {
          recipient,
          subject: "Test message from Critic",
          message_id: `test-message-${Date.now()}@critic`,
        },
      })
      .then((response) => response.json())
      .then(({ sent, reason, error }) => {
        if (sent) dispatch(showToast({ title: "Test message sent!" }))
        else
          dispatch(
            showToast({
              type: "error",
              title: "Failed to send test message...",
              content: reason,
            }),
          )
      })
  }

  return (
    <Section id="email-delivery" title="SMTP server configuration">
      <FormGroup className={classes.flex} label="Address">
        <TextField
          className={classes.hostname}
          settingKey="smtp.address.host"
          label="Hostname"
          {...connectedControlProps}
        />
        <TextField
          className={classes.port}
          settingKey="smtp.address.port"
          label="Port"
          {...connectedControlProps}
        />
      </FormGroup>
      <FormGroup label="Connection security">
        <Checkbox
          className={classes.hostname}
          settingKey="smtp.use_smtps"
          label="Use SMTPS"
          {...connectedControlProps}
        />
        <Checkbox
          className={classes.port}
          settingKey="smtp.use_starttls"
          label="Use STARTTLS"
          {...connectedControlProps}
        />
      </FormGroup>
      <SaveOrReset
        isModified={isModified}
        isSaving={isSaving}
        save={save}
        reset={reset}
      />
      <FormGroup className={classes.flex} label="Send test message">
        <MuiTextField
          className={classes.recipient}
          label="Recepient"
          value={recipient}
          onChange={(ev) => setRecipient(ev.target.value)}
        />
        <Button
          className={classes.send}
          variant="contained"
          color="secondary"
          disabled={!recipient}
          onClick={() => sendTestMessage()}
        >
          Send
        </Button>
      </FormGroup>
    </Section>
  )
}

export default SettingsPanel
