import * as vscode from 'vscode';
import * as path from 'path';
import { CodeReviewIssue, IssueReply, getStatusIcon, getStatusLabel } from '../models/codeReviewIssue';
import { IssueStorage } from '../services/issueStorage';

export class ReplyTreeItem extends vscode.TreeItem {
    constructor(
        public readonly reply: IssueReply,
        public readonly parentIssue: CodeReviewIssue,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(reply.content, collapsibleState);
        
        this.description = `${reply.author} - ${new Date(reply.createdAt).toLocaleString()}`;
        this.contextValue = 'reply';
        // 移除图标设置
        // this.iconPath = new vscode.ThemeIcon('comment');
    }
}

// 在 IssueTreeItem 类中添加或修改
export class IssueTreeItem extends vscode.TreeItem {
    constructor(
        public readonly issue: CodeReviewIssue,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        super(issue.description, collapsibleState);
        
        this.tooltip = `${issue.description} (${issue.status})`;
        this.description = `${issue.filePath}:${issue.lineNumber}`;
        this.contextValue = issue.status.toLowerCase() + 'Issue';
        
        // 移除图标设置
        // this.iconPath = this.getIconForStatus(issue.status);
        
        // 添加命令，点击时跳转到问题位置
        this.command = {
            command: 'code-river.openIssueLocation',
            title: '打开问题位置',
            arguments: [issue]
        };
    }
    
    // 可以保留这个方法，但不再使用它
    private getIconForStatus(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'Open':
                return new vscode.ThemeIcon('issues');
            case 'Fixed':
                return new vscode.ThemeIcon('check');
            case 'Approved':
                return new vscode.ThemeIcon('thumbsup');
            case 'WontFix':
                return new vscode.ThemeIcon('x');
            default:
                return new vscode.ThemeIcon('circle-outline');
        }
    }
}

export class IssueProvider implements vscode.TreeDataProvider<IssueTreeItem | ReplyTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<IssueTreeItem | ReplyTreeItem | undefined> = new vscode.EventEmitter<IssueTreeItem | ReplyTreeItem | undefined>();
    readonly onDidChangeTreeData: vscode.Event<IssueTreeItem | ReplyTreeItem | undefined> = this._onDidChangeTreeData.event;
    
    constructor(private issueStorage: IssueStorage) {}
    
    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
    
    getTreeItem(element: IssueTreeItem | ReplyTreeItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: IssueTreeItem | ReplyTreeItem): Promise<(IssueTreeItem | ReplyTreeItem)[]> {
        if (!element) {
            // 根级别：显示所有问题
            const issues = await this.issueStorage.getIssues();
            
            // 检查是否只显示工作区内的问题
            const showOnlyWorkspaceIssues = vscode.workspace.getConfiguration('codeRiver').get('showOnlyWorkspaceIssues', true);
            
            let filteredIssues = issues;
            
            if (showOnlyWorkspaceIssues && vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
                const workspacePaths = vscode.workspace.workspaceFolders.map(folder => folder.uri.fsPath);
                
                filteredIssues = issues.filter(issue => {
                    return workspacePaths.some(wsPath => issue.filePath.startsWith(wsPath));
                });
            }
            
            return filteredIssues.map(issue => 
                new IssueTreeItem(
                    issue, 
                    issue.replies && issue.replies.length > 0 
                        ? vscode.TreeItemCollapsibleState.Collapsed 
                        : vscode.TreeItemCollapsibleState.None
                )
            );
        } else if (element instanceof IssueTreeItem) {
            // 问题级别：显示回复
            return (element.issue.replies || []).map(reply => 
                new ReplyTreeItem(reply, element.issue, vscode.TreeItemCollapsibleState.None)
            );
        }
        
        return [];
    }
}
