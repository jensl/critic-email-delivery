import React, { useEffect } from "react"

import SettingsPanel from "./SettingsPanel"
import { useCritic } from "../../extension"

const EmailDelivery: React.FunctionComponent<{}> = () => {
  console.log("email-delivery::initialize")
  const critic = useCritic()
  useEffect(() => {
    critic.registerItem(
      "system-settings-panels",
      critic.extension.name,
      SettingsPanel,
    )
  }, [critic])
  return null
}

export default EmailDelivery
