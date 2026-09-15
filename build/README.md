# Aiyla Command Centre ARM64 NSIS installer override

These files are a narrow, reviewed copy of Electron Builder’s NSIS templates for **Aiyla Command Centre’s ARM64-only installer**. The default Electron Builder payload selector relies on NSIS architecture detection. That detector can report no matching architecture under Windows emulation, which can result in an empty installation directory even though the installer finishes.

`aiyla-arm64-installer.nsi` therefore selects and extracts the embedded `APP_ARM64` payload directly. The embedded payload uses Electron Builder's supported ZIP format and NSIS unzip path, avoiding the unreliable 7-Zip extraction stage observed during isolated installation testing. This installer is explicitly distributed only for Windows 11 ARM64 devices such as the Snapdragon Surface Laptop. It must not be relabelled as a universal x64 installer.

`differentialPackage` is disabled because Aiyla has no configured auto-update service. Electron Builder otherwise selects its 7-Zip payload even when `useZip` is enabled, which would not match this installer script.

`runAfterFinish` is disabled so a completed setup never tries to launch or repair an unrelated, older Aiyla shortcut. The setup creates the distinct `Aiyla Command Centre` desktop and Start Menu shortcuts instead.

When updating Electron Builder, compare this file with its current NSIS templates before changing it. The Windows ARM64 GitHub Actions workflow must build, silently install, and verify the direct shortcut target before publishing a release.
