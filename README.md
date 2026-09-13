# Sagalution Life & Work Command Centre — Aiyla

This is the **Blueprint V2 local package** for Aiyla and the Sagalution Life & Work Command Centre. It is a native-feeling Electron application for Windows, with a floating desktop Aiyla Orbit and one full Command Centre dashboard.

## Included in this package

The local package includes the final Blueprint V2 command-centre shell: minimal Orbit Home; Overview; Email; Calendar; Personal & Family; Australia Operations; UAE Operations; International Expansion; Projects; Computer; Browser; Aiyla Working; History; Connections; and Settings.

It also includes a local Aiyla Core for tasks, projects, capture, follow-ups, decisions, people, documents, calendar references, work plans, approvals, permissions, connections, conversation records, work states, and History. No records leave the computer in this package.

Home now remains deliberately minimal while still being useful: it contains the Orbit, the typed request field, a persistent local conversation thread, written response cards, active acknowledgement cards, and visible Ready, Thinking, Working, Waiting for You, Complete, and Stopped states. Consequential actions remain proposals only; their Approve, Edit, Defer, and Cancel choices are recorded in the thread and History.

For a safe local demonstration of the approval experience, select **Prepare a proposal** from Home. Aiyla will create a pending acknowledgement card in the conversation, with no external action. Approving, editing, deferring, or cancelling it updates both the conversation and History. This flow is also covered by an Electron main-process integration test.

The desktop Orbit is a deliberately discreet green presence: a luminous core with translucent moving rings and a small Ready badge, positioned above the Windows taskbar. Clicking it opens Aiyla. The Home Orbit is larger and more visual, with green circulation and breathing motion that becomes more active while Aiyla is listening, thinking, or working, then calms when the response is complete.

## What is intentionally not active yet

Live speech-to-text, file execution, browser/CRM work, email, calendars, phone features, and wake-word listening need their own account, permission, credential, or on-device test. The visual workspaces and approval controls are included now so those capabilities can be activated safely later.

## Enable the OpenAI Aiyla Brain

The package already contains the protected main-process integration for text conversation. It does not contain an API key. After creating your OpenAI API project and a conservative spend limit, set a **local Windows environment variable** named `AIYLA_OPENAI_API_KEY` to your key, then close and reopen Aiyla. You may optionally set `AIYLA_OPENAI_MODEL` to a model available in your OpenAI project; otherwise the package uses `gpt-5-mini`.

Do not paste the key into the Aiyla dashboard, a chat message, a document, or the source code. Aiyla sends only your typed request and a small local summary of open actions, active projects, follow-ups, and decisions. It has no API tools enabled: it cannot browse, operate your computer, access email, or take external actions merely because the OpenAI key is configured.

## Run from source

Open PowerShell in this folder and run:

```powershell
corepack enable
pnpm install
pnpm test
pnpm dev
```

## Windows ARM64 package

Use the package command below after installing dependencies on a Windows ARM64 computer:

```powershell
pnpm exec electron-builder --win portable --arm64
```

The resulting portable folder/ZIP can be extracted to a normal local folder and opened through `Aiyla.exe`.

## Controlled GitHub Windows release test

The source includes a deliberately **manual-only** GitHub Actions workflow at `.github/workflows/release-windows-arm64.yml`. It creates the normal assisted Windows ARM64 NSIS installer on GitHub's `windows-latest` runner, runs the local tests first, calculates a SHA-256 checksum, and uploads both as workflow artifacts.

It can create a public GitHub Release only when the repository owner deliberately starts the workflow with **Publish the release** set to `true`. No release is created by an ordinary source push or tag. This is a controlled distribution test based on the prior Ayla delivery method; it is not a substitute for code signing and does not promise that Smart App Control will accept an unknown unsigned release.

The public repository must contain this lightweight Aiyla source and workflow, but it must never contain a user API key, local Core records, account data, Windows credential-store data, or installer output. The release asset is the direct installer file `Aiyla Setup <version>.exe` plus `SHA256SUMS.txt`, not a ZIP-wrapped executable.

## Safety model

The package does not access folders, applications, websites, accounts, emails, calendars, or phone data. All of those require an explicit later connection/permission flow. Work Outlook begins observe/report only; the existing Power Automate email workflow remains separate.
