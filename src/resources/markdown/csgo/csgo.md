# CS:GO Legacy Version Setup (Debug Fork)

This guide applies to the debug fork of LIGA: Pro Journey. For official documentation, visit: https://github.com/playliga/prototype

## About

Counter-Strike 2 is missing many features that prevent proper match functionality. This guide shows how to enable the CS:GO legacy version for testing purposes.

> 📝 Note: You can use both CS2 and CS:GO. The launcher will prompt you to choose.

## Steps

1. Right-click on Counter-Strike 2 in your Steam library
2. Click `Properties`
3. Click on the `Betas` tab
4. In the `Beta Participation` dropdown, select `csgo_legacy - Legacy Version of CS:GO`
5. Steam will download CS:GO automatically

## Launching

When you want to test with CS2, launch it normally from Steam Library.

You'll see a dialog to choose between CS2 and CS:GO. You can enable `Always use this option` to skip this dialog.

---

## For Debugging

When testing matches in this debug fork:
- Check the console output for logs
- Review the game logs directory for match data
- Test with both CS2 and CS:GO to identify game-specific issues
