import * as vscode from 'vscode';

import { execFile } from 'child_process';
import assert = require('assert');

export function activate(context: vscode.ExtensionContext) {

	// vscode.window.showInformationMessage('Extension activated!');

	context.subscriptions.push(vscode.commands.registerCommand('vschor-grammar.previewfsa', () => {
		const panel = vscode.window.createWebviewPanel(
			'fsapreview', // Identifies the type of the webview. Used internally
			'FSA Preview', // Title of the panel displayed to the user
			vscode.ViewColumn.Beside, // Editor column to show the new webview panel in.
			{} // Webview options. More on these later.
		);
	}));

	vscode.workspace.onDidSaveTextDocument(generatePreview);

}

function generatePreview(document: vscode.TextDocument) {
	vscode.window.showInformationMessage(`Document saved! Filename ${document.fileName}`);

	const cmd = execFile('cat', [document.fileName]);

	cmd.stdout?.on('data', (data) => {
		vscode.window.showInformationMessage(data);
	});

	cmd.stderr?.on('data', (data) => {
		vscode.window.showErrorMessage(data);
	});

	cmd.on("error", (err) => {
		vscode.window.showErrorMessage(err.message);
	})

	cmd.on('close', (code) => {
		vscode.window.showInformationMessage(`Exit code: ${code}`);
	})
}


export function deactivate() { }
