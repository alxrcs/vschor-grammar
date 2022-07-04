import * as vscode from 'vscode';

import { execFile } from 'child_process';
import * as util from 'util';
import * as path from 'path';
import { getGenerateLTSCommand, getProjectCommand, getPreviewCommand } from './config';

export function activate(context: vscode.ExtensionContext) {
	// Register a command to generate the LTS of the 
	context.subscriptions.push(vscode.commands.registerCommand(
		"vschor-grammar.genlts",
		generateLTSCommand
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		"vschor-grammar.project",
		projectGC
	))

	// Generate previews whether opening or saving the original files
	vscode.workspace.onDidSaveTextDocument(generatePreview);
	vscode.workspace.onDidOpenTextDocument(generatePreview);

}

async function generateLTSCommand() {
	vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Generating LTS",
		cancellable: false
	}, async (progress, token) => {
		if (!vscode.workspace.workspaceFolders ||
			vscode.workspace.workspaceFolders?.length < 1) {
			vscode.window.showErrorMessage("ChorGram folder must be open.");
			return;
		} else if (vscode.window.activeTextEditor?.document.languageId != "fsa") {
			vscode.window.showErrorMessage("Please select a valid fsa file.");
			return;
		}
		let document = vscode.window.activeTextEditor.document;
		let path = document.uri.path;
		let filename = document.fileName;
		let fullCmd = getGenerateLTSCommand() + " --output-filename " + filename + ".lts.dot";
		let stdout = await runCommand(fullCmd, path);
		// vscode.window.showInformationMessage(stdout || "No output");

		// Show LTS preview
		let uri = vscode.Uri.file(document.fileName + ".lts.dot");
		await vscode.commands.executeCommand('graphviz.previewToSide', uri);
	}
	);
}

async function projectGC() {
	vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: "Projecting GC",
		cancellable: false
	}, async (progress, token) => {
		if (!vscode.workspace.workspaceFolders ||
			vscode.workspace.workspaceFolders?.length < 1) {
			vscode.window.showErrorMessage("ChorGram folder must be open.");
			return;
		} else if (vscode.window.activeTextEditor?.document.languageId != "gc") {
			vscode.window.showErrorMessage("Please select a valid gc file.");
			return;
		}
		let document = vscode.window.activeTextEditor.document;
		let filename = document.fileName;
		let cmd = getProjectCommand();
		await runCommand(cmd, filename);

		// Open the resulting fsa file
		let uri = vscode.Uri.file(
			path.join(
				path.join(path.dirname(filename), "fsa"), path.basename(filename, ".gc") + ".fsa")
		);
		await vscode.commands.executeCommand('vscode.open', uri);
	});
}

async function generatePreview(document: vscode.TextDocument): Promise<void> {

	if (!(["gc", "fsa"].includes(document.languageId))) return;

	if (!vscode.workspace.workspaceFolders ||
		vscode.workspace.workspaceFolders?.length < 1) {
		vscode.window.showErrorMessage("ChorGram folder must be open.");
		// TODO: Make chorgram executables installable & configurable in the extension.
		return;
	}

	let cmd = getPreviewCommand(document.languageId)
	const dot = await runCommand(cmd, document.uri.path)

	// Write the command output to a tmp file
	const encoder = new util.TextEncoder(); // UTF-8 by default
	const tmpDotURI = vscode.Uri.file(path.join(vscode.workspace.workspaceFolders[0].uri.path, document.fileName + '.tmp.dot'));
	await vscode.workspace.fs.writeFile(tmpDotURI, encoder.encode(dot))

	// Show DOT preview
	await vscode.commands.executeCommand('graphviz.previewToSide', tmpDotURI);

	// Return focus to the original document
	await vscode.window.showTextDocument(document, vscode.ViewColumn.One);
}

async function runCommand(cmd: string, path: string) {

	if (!vscode.workspace.workspaceFolders ||
		vscode.workspace.workspaceFolders?.length < 1) {
		vscode.window.showErrorMessage("ChorGram folder must be open.");
		// TODO: Make chorgram executables installable & configurable in the extension.
		return;
	}

	const cwd = vscode.workspace.workspaceFolders[0];
	let fullCmd = cwd.uri.path + '/' + cmd;

	return new Promise<string>((resolve, reject) => {
		execFile(
			cmd[0] == '.' ? fullCmd : cmd,
			[path],
			{ cwd: cwd.uri.path, shell: '/bin/bash', env: process.env },
			async (error, stdout, stderr) => {
				if (error) {
					reject(stderr);
					await vscode.window.showErrorMessage(error.message);
					await vscode.window.showErrorMessage(stderr);
					return;
				}
				resolve(stdout.trim());
			}
		);
	})
}


export function deactivate() { }

