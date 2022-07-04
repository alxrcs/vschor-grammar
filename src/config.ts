import { window, workspace } from "vscode";

function getPythonPath(): string | undefined {
    let pythonPath: string | undefined = workspace.getConfiguration("vschor-grammar").get("pythonPath");

    if (pythonPath) {
        return pythonPath;
    }

    window.showErrorMessage("Please set the pythonPath in the chorgram settings.");
    return undefined;
}

function getChorgramPath() {
    let chorgramPath: string | undefined = workspace.getConfiguration("vschor-grammar").get("chorgramPath");

    if (chorgramPath) {
        return chorgramPath;
    }

    window.showErrorMessage("Please set the path to Chorgram in the extension settings.");
    return undefined;
}

export function getPreviewCommand(extension: string) {
    const PREVIEW_COMMAND: { [key: string]: string } = {
        "gc": `${getChorgramPath() + "/gc2dot"}`,
        "fsa": `${getPythonPath()} -m chortest getdot`
    };
    return PREVIEW_COMMAND[extension];
}

export function getGenerateLTSCommand() {
    return `${getPythonPath()} -m chortest genlts`;
}

export function getProjectCommand() {
    return `${getPythonPath()} -m chortest project`;
}