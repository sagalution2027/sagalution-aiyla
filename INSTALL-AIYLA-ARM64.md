# Install Aiyla — Windows ARM64 (Snapdragon)

This release is the **Sagalution Life & Work Command Centre Blueprint V2 local package** for your Windows 11 Snapdragon laptop. It includes Aiyla’s finished local dashboard and Core, with no live account access enabled by default.

## Install and open

Extract the portable release ZIP to a permanent local folder such as `C:\Users\sagal\Aiyla`. Open `Aiyla.exe` from inside that extracted folder. The app starts as a discreet green **Aiyla Ready** desktop Orbit above the Windows taskbar; click it to open the full Command Centre. Closing the main window returns to the Orbit instead of closing the Aiyla process. The larger Home Orbit uses green breathing and circulation motion, becoming more active when Aiyla is thinking or working.

This is an unsigned personal Windows application. Windows may show a reputation or SmartScreen notice the first time it is opened. Review that the file came from this package and decide whether you wish to run it.

## What to check first

Confirm that Home is minimal and Orbit-led, and that the final sidebar reads: Home, Overview, Email, Calendar, Personal & Family, Australia Operations, UAE Operations, International Expansion, Projects, Computer, Browser, Aiyla Working, History, Connections, and Settings. Type a request to confirm that the request and Aiyla’s response remain visible in the Home conversation thread. Add a local action or project to confirm that it is recorded in Aiyla Core. The task list, project list, capture, follow-ups, decisions, local calendar references, working plans, approvals, connection status, conversation records, and History all remain local in this release.

Home visibly shows Aiyla’s current state as **Ready**, **Thinking**, **Working**, **Waiting for You**, **Complete**, or **Stopped**. When work is active, use **Stop** to cancel the local request. If Aiyla ever prepares a consequential action for your acknowledgement, its card shows the proposed step and its boundary, with **Approve**, **Edit**, **Defer**, and **Cancel** controls. The action is recorded locally in both the conversation and History; it does not execute an external action in this package.

To see the local acknowledgement flow safely, choose **Prepare a proposal** on Home. It creates a pending card only; use it to verify Approve, Edit, Defer, and Cancel. No message, file, booking, browser action, or account change is performed by this local demonstration.

## Activate text conversation later

The optional **Aiyla Brain** code is already inside the package but does not include an API key. When you are ready, create an OpenAI API project, create a key and set a conservative spend limit. In Windows, search for **Environment Variables**, choose **Edit environment variables for your account**, then create a user variable named `AIYLA_OPENAI_API_KEY` with the key as its value. Close and reopen Aiyla afterwards.

You may optionally create `AIYLA_OPENAI_MODEL` if your OpenAI project uses a different supported model. Without it, Aiyla uses `gpt-5-mini`. Never paste your key into Aiyla’s dashboard, a chat, a document, or the source package. The key is read only by Electron’s protected main process. Aiyla sends the typed request and a narrow summary of local actions, projects, follow-ups and decisions; it does not send local documents, people, email data, or key material.

> Activating the Aiyla Brain enables **text-only conversational reasoning**. It does not turn on email, calendars, file control, Browser Agent, purchases, submissions, or any other external action.

## Voice and execution boundaries

The package includes a microphone health check and local spoken-response controls. It does **not** yet contain Windows speech-to-text or the **Hey Aiyla** wake phrase, so it must not be expected to transcribe speech or converse by voice before the native Windows speech helper is completed and tested on the laptop.

Computer and Browser are fully structured Aiyla workspaces with scope, working-status and approval controls, but their actual runners remain disabled. They will be enabled only after you authorise particular folders, applications, browser sites and sessions. Work Outlook is also deliberately **observe/report only** at first, and the existing Power Automate email workflow remains independent.

## If something does not open

Open the source package instead and run the following in PowerShell from the project folder. This checks the application code before starting it.

```powershell
corepack enable
pnpm install
pnpm test
pnpm dev
```

For the OpenAI text-conversation connection, confirm that the environment variable is set for the same Windows user who opens Aiyla, then restart the application. The official Responses API supports text requests with separate application instructions and user input; Aiyla uses that interface with `store: false` for this initial local conversation path.[1]

## References

[1]: https://developers.openai.com/api/docs/guides/text "OpenAI API — Text generation"
