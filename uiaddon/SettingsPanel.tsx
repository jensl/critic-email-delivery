import React, { useState } from "react"
import clsx from "clsx"

import MuiTextField from "@material-ui/core/TextField"
import Button from "@material-ui/core/Button"
import Snackbar from "@material-ui/core/Snackbar"
import Typography from "@material-ui/core/Typography"
import Alert from "@material-ui/lab/Alert"
import { makeStyles } from "@material-ui/core/styles"

import FormGroup from "../../components/Form.Group"
import SaveOrReset from "../../components/Settings.Buttons.SaveOrReset"
import Section from "../../components/Settings.System.Section"
import TextField from "../../components/Settings.System.TextField"
import Checkbox from "../../components/Settings.System.Checkbox"
import useConnectedControls from "../../utils/ConnectedControls"
import { useResource, useSignedInUser, useSubscription } from "../../utils"
import { useCritic } from "../../extension"
import { useDispatch } from "../../store"
import { loadSystemSettingByPrefix } from "../../actions/system"

const useStyles = makeStyles((theme) => ({
  flex: { display: "flex", alignContent: "baseline" },

  credentials: { display: "flex" },
  encryption: { margin: theme.spacing(1, 0) },

  hostname: { marginRight: theme.spacing(1), flexGrow: 3 },
  port: { marginLeft: theme.spacing(1), flexGrow: 1 },
  username: { marginRight: theme.spacing(1), flexGrow: 2 },
  password: { marginLeft: theme.spacing(1), flexGrow: 2 },
  sender: { flexGrow: 1 },

  testMessage: { marginTop: theme.spacing(3) },
  recipient: { margin: theme.spacing(1), flexGrow: 1 },
  send: {
    marginLeft: theme.spacing(1),
    flexGrow: 0,
    marginTop: "auto",
    marginBottom: "auto",
  },
}))

const Contents: React.FunctionComponent<{}> = () => {
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
  const [testMessageResult, setTestMessageResult] = useState<{
    recipient?: string
    reason?: string
  }>({})

  useSubscription(loadSystemSettingByPrefix, "smtp")

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
        if (sent) setTestMessageResult({ recipient })
        else setTestMessageResult({ reason })
      })
  }

  const handleClose = () => setTestMessageResult({})

  return (
    <>
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
        <div className={classes.credentials}>
          <TextField
            className={classes.username}
            settingKey="smtp.credentials.username"
            label="Username"
            {...connectedControlProps}
          />
          <TextField
            className={classes.password}
            settingKey="smtp.credentials.password"
            label="Password"
            {...connectedControlProps}
            TextFieldProps={{ type: "password" }}
          />
        </div>
        <div className={classes.encryption}>
          <Checkbox
            settingKey="smtp.use_smtps"
            label="Use SMTPS"
            {...connectedControlProps}
          />
        </div>
        <div className={classes.encryption}>
          <Checkbox
            settingKey="smtp.use_starttls"
            label="Use STARTTLS"
            {...connectedControlProps}
          />
        </div>
      </FormGroup>
      <FormGroup className={classes.flex} label="Miscellaneous">
        <TextField
          className={classes.sender}
          settingKey="smtp.sender"
          label="Sender"
          {...connectedControlProps}
        />
      </FormGroup>
      <SaveOrReset
        isModified={isModified}
        isSaving={isSaving}
        save={save}
        reset={reset}
      />
      <FormGroup
        className={clsx(classes.flex, classes.testMessage)}
        label="Send test message"
      >
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
      {!!testMessageResult.recipient && (
        <Snackbar open autoHideDuration={5000} onClose={handleClose}>
          <Alert severity="success">
            Test message sent to {testMessageResult.recipient}
          </Alert>
        </Snackbar>
      )}
      {!!testMessageResult.reason && (
        <Snackbar open autoHideDuration={10000} onClose={handleClose}>
          <Alert severity="error" onClose={handleClose}>
            <Typography variant="body1">
              Failed to send test message!
            </Typography>
            <Typography variant="body2">
              Reason: {testMessageResult.reason}
            </Typography>
          </Alert>
        </Snackbar>
      )}
    </>
  )
}

const SettingsPanel: React.FunctionComponent<{}> = () => {
  return (
    <Section id="email-delivery" title="SMTP server configuration">
      <Contents />
    </Section>
  )
}

export default SettingsPanel
