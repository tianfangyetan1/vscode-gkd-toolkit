import * as assert from 'assert';
import * as vscode from 'vscode';

suite('GKD Toolkit Test Suite', () => {
	test('VS Code API is available', () => {
		assert.ok(vscode.workspace);
	});

	test('Workspace folders access does not throw', () => {
		assert.doesNotThrow(() => {
			void vscode.workspace.workspaceFolders;
		});
	});
});
