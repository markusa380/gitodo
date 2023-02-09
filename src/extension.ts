import * as vscode from "vscode";
import * as cp from "child_process";
import { TreeItemLabel } from "vscode";

const ORIGINAL_FILE_REGEX = /--- (.*) ''(.*)''/;
const NEW_FILE_REGEX = /\+\+\+ b\/(.*)/;
const CHUNK_HEADER_REGEX = /@@ -(\d+)([,\d]*) \+(\d+)([,\d]*) @@ .*/;
const ADDED_LINE_REGEX = /^\+(.*)$/;
const REMOVED_LINE_REGEX = /^-(.*)$/;
const UNCHANGED_LINE_REGEX = /^ (.*)$/;
const SEARCH_WORD = "todo";

export function activate(context: vscode.ExtensionContext) {
  let provider = new GiToDoProvider();

  let treeView = vscode.window.createTreeView("gitodo", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  let onSave = vscode.workspace.onDidSaveTextDocument((e) => {
    updateTreeView(provider);
  });

  updateTreeView(provider);

  context.subscriptions.push(onSave);
  context.subscriptions.push(treeView);
}

function updateTreeView(provider: GiToDoProvider) {
  const currentDir = vscode.workspace.workspaceFolders?.[0].uri.path;
  if (!currentDir) {
    return;
  }

  cp.exec(`git -C ${currentDir} diff`, (err, stdout, stderr) => {
    if (err) {
      console.error("git diff failed: " + err);
    }

    let data: GiToDoFileTreeItem[] = [];
    let curLines: GiToDoLineTreeItem[] = [];
    var curFile = "";
    var curLineNumber = 0;

    stdout.split("\n").forEach((line) => {
      if (line.trim().length === 0) {
        return;
      }

      if (ORIGINAL_FILE_REGEX.test(line)) {
        // Do nothing
      } else if (NEW_FILE_REGEX.test(line)) {
        // Flush old file
        if (curLines.length > 0) {
          data.push(new GiToDoFileTreeItem(curFile, curLines));
        }
        curLines = [];
        curFile = line.match(NEW_FILE_REGEX)![1];
      } else if (CHUNK_HEADER_REGEX.test(line)) {
        curLineNumber = parseInt(line.match(CHUNK_HEADER_REGEX)![3]);
      } else if (ADDED_LINE_REGEX.test(line)) {
        let lineText = line.match(ADDED_LINE_REGEX)![1];
        if (lineText.toLowerCase().includes(SEARCH_WORD)) {
          curLines.push(
            new GiToDoLineTreeItem(curFile, lineText, curLineNumber, currentDir)
          );
        }
        curLineNumber++;
      } else if (REMOVED_LINE_REGEX.test(line)) {
        // Do nothing
      } else if (UNCHANGED_LINE_REGEX.test(line)) {
        curLineNumber++;
      } else {
        console.info("Unexpected line matching no known pattern:", line);
      }
    });

    if (curLines.length > 0) {
      data.push(new GiToDoFileTreeItem(curFile, curLines));
    }

    provider.data = data;
    provider.refresh();
  });
}

interface GiToDoTreeItem extends vscode.TreeItem {
  isFile: boolean;
}

class GiToDoFileTreeItem implements GiToDoTreeItem {
  label: string;
  children: GiToDoLineTreeItem[];
  isFile: boolean = true;
  collapsibleState: vscode.TreeItemCollapsibleState =
    vscode.TreeItemCollapsibleState.Expanded;
  resourceUri: vscode.Uri;

  constructor(file: string, children: GiToDoLineTreeItem[]) {
    this.label = file;
    this.children = children;
    this.resourceUri = vscode.Uri.file("./" + file);
  }
}

class GiToDoLineTreeItem implements GiToDoTreeItem {
  label: TreeItemLabel;
  line: string;
  lineNumber: number;
  isFile: boolean = false;
  command: vscode.Command;

  constructor(file: string, line: string, lineNumber: number, dir: string) {
    let trimmed = line.trimStart();
    let index = trimmed.toLowerCase().indexOf(SEARCH_WORD);

    let ellipsis = "...";
    let resultLength = 20;
    var result = "";

    if (trimmed.length > resultLength) {
      if (index > resultLength - SEARCH_WORD.length) {
        result += ellipsis + " ";
        let startIndex = Math.max(
          0,
          index + SEARCH_WORD.length - resultLength + ellipsis.length + 1
        );
        result += trimmed.substring(startIndex);
      } else {
        result = trimmed;
      }
    } else {
      result = trimmed;
    }

    let prefix = `line ${lineNumber}: `;

    let column = index + prefix.length;

    this.label = {
      label: prefix + result,
      highlights: [[column, column + SEARCH_WORD.length]],
    };
    this.line = line;
    this.lineNumber = lineNumber;

    let open;
    if (process.platform === "linux") {
      open = dir + "/" + file + ":" + lineNumber + ":" + column;
    } else {
      open = dir + "/" + file + "#" + lineNumber;
    }

    this.command = {
      command: "vscode.open",
      title: "Open File",
      arguments: [open],
    };
  }
}

class GiToDoProvider implements vscode.TreeDataProvider<GiToDoTreeItem> {
  data: GiToDoFileTreeItem[] = [];

  getTreeItem(element: GiToDoTreeItem): GiToDoTreeItem {
    return element;
  }

  getChildren(
    element?: GiToDoTreeItem
  ): vscode.ProviderResult<GiToDoTreeItem[]> {
    if (element) {
      if (element.isFile) {
        return (element as GiToDoFileTreeItem).children;
      } else {
        return [];
      }
    } else {
      return this.data;
    }
  }

  private _onDidChangeTreeData: vscode.EventEmitter<
    GiToDoTreeItem | undefined | null | void
  > = new vscode.EventEmitter<GiToDoTreeItem | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<
    GiToDoTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

// This method is called when your extension is deactivated
export function deactivate() {}
