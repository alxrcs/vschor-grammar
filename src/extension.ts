import * as vscode from 'vscode';

import * as cp from 'child_process';
import * as util from 'util';
import * as path from 'path';
import assert = require('assert');

import { getGenerateLTSCommand, getProjectCommand, getPreviewCommand } from './config';

const diagnosticCollection = vscode.languages.createDiagnosticCollection('vschor-grammar');

export function activate(context: vscode.ExtensionContext) {

	// Register a command to generate the LTS of the currently open FSA
	context.subscriptions.push(vscode.commands.registerCommand(
		"vschor-grammar.genlts",
		generateLTSCommand
	));
	context.subscriptions.push(vscode.commands.registerCommand(
		"vschor-grammar.project",
		projectGC
	))

	context.subscriptions.push(
		vscode.workspace.onDidCloseTextDocument(document => {
			diagnosticCollection.delete(document.uri);
		})
	);

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
		
		assert(vscode.workspace.workspaceFolders, "No workspace folder found")
		let folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
		
		if (vscode.window.activeTextEditor?.document.languageId != "fsa") {
			vscode.window.showErrorMessage("Please select a valid fsa file.");
			return;
		}

		let document = vscode.window.activeTextEditor.document;
		let filepath = document.uri.fsPath;
		let filename = document.fileName;
		let dotFilename = filename + ".lts.dot";
		let fullCmd = getGenerateLTSCommand() + ` --output-filename ${dotFilename}`;
		let stdout = await runCommand(fullCmd, filepath);

	let config = vscode.workspace.getConfiguration('vschor-grammar');

	// Check if the configuration is set to automatically generate a pdf
	if (config && config.get('generatePDF')){
		// Transform the dot file into a pdf
		const pdf = await runCommand(`dot -Tpdf ${dotFilename}`, folder, { encoding: 'binary' })

		// Write the pdf to a tmp file
		const tmpPDFURI = vscode.Uri.file(document.fileName + 'lts.pdf');
		await vscode.workspace.fs.writeFile(tmpPDFURI, Buffer.from(pdf, 'binary'))
	}

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

		if (vscode.window.activeTextEditor?.document.languageId != "gc") {
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
				path.dirname(filename),
				path.basename(filename, ".gc") + ".fsa"
			)
		);
		await vscode.commands.executeCommand('vscode.open', uri);
	});
}

async function generatePreview(document: vscode.TextDocument): Promise<void> {
	if (!(["gc", "fsa"].includes(document.languageId))) return;

	let cmd = getPreviewCommand(document.languageId)
	const dot = await runCommand(cmd, document.uri.fsPath)

	assert(vscode.workspace.workspaceFolders, "No workspace folder found")
	let folder = vscode.workspace.workspaceFolders[0].uri.fsPath;

	// Write the command output to a tmp file
	const encoder = new util.TextEncoder(); // UTF-8 by default
	const tmpDotURI = vscode.Uri.file(document.fileName + '.tmp.dot');

	await vscode.workspace.fs.writeFile(tmpDotURI, encoder.encode(dot))

	// Show DOT preview
	await vscode.commands.executeCommand('graphviz.previewToSide', tmpDotURI);

	let config = vscode.workspace.getConfiguration('vschor-grammar');

	// Check if the configuration is set to automatically generate a pdf
	if (config && config.get('generatePDF')){
		// Transform the dot file into a pdf
		const pdf = await runCommand(`dot -Tpdf ${tmpDotURI.path}`, folder, { encoding: 'binary' })

		// Write the pdf to a tmp file
		const tmpPDFURI = vscode.Uri.file(document.fileName + '.pdf');
		await vscode.workspace.fs.writeFile(tmpPDFURI, Buffer.from(pdf, 'binary'))
	}

	// Return control back to the original editor
	await vscode.window.showTextDocument(document, vscode.ViewColumn.One, false);
}


/**
 * Run the given command in the given path.
 * @param cmd - The command to run
 * @param path - The path to run the command in
 * @returns - A Promise that resolves with the command output or rejects with an error
 */
async function runCommand(cmd: string, path: string, options = {}): Promise<string> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage("No workspace folder found");
		return "";
	}

	const cwd = workspaceFolders[0].uri.fsPath;
	const document = vscode.window.activeTextEditor?.document as vscode.TextDocument;

	try {
		return new Promise<string>((resolve, reject) => {
			cp.execFile(
				cmd,
				[path],
				{ cwd, shell: '/bin/bash', env: process.env, ...options },
				async (error, stdout, stderr) => {
					if (error) {
						reject(stderr);
						// await vscode.window.showErrorMessage(error.message);
						let errors = parseErrors(stderr, document);
						diagnosticCollection.set(document.uri, errors);

						// await vscode.window.showErrorMessage(errors[0].message);
						return;
					} else {
						diagnosticCollection.set(document.uri, [])
					}
					resolve(stdout);
				}
			);
		});
	} catch (error: any) {
		vscode.window.showErrorMessage(error.message);
		return "";
	}
}

function parseErrors(errorOutput: string, document: vscode.TextDocument): vscode.Diagnostic[] {
	const diagnostics: vscode.Diagnostic[] = [];

	// Regular expression to match error messages
	const errorRegex = /Syntax error at <(\d+),(\d+)>: (.*)(?:\n|$)/g;
	let match: RegExpExecArray | null;

	while ((match = errorRegex.exec(errorOutput)) !== null) {
		const lineNumber = parseInt(match[1], 10) - 1; // 0-based line number
		const columnNumber = parseInt(match[2], 10) - 1; // 0-based column number
		const errorMessage = match[3];

		const range = new vscode.Range(lineNumber, columnNumber, lineNumber, columnNumber + 1);
		const diagnostic = new vscode.Diagnostic(range, errorMessage, vscode.DiagnosticSeverity.Error);
		diagnostics.push(diagnostic);
	}

	return diagnostics;
}


export function deactivate() { }

