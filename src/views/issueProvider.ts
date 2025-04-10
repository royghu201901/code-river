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
        this.iconPath = new vscode.ThemeIcon('comment');
    }
}

// 在 IssueTreeItem 类中添加或修改
export class IssueTreeItem extends vscode.TreeItem {
    constructor(
        public readonly issue: CodeReviewIssue,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState
    ) {
        const label = `${path.basename(issue.filePath)}:${issue.lineNumber + 1}`;
        super(label, collapsibleState);
        
        this.tooltip = issue.description;
        this.description = issue.description.length > 50 
            ? `${issue.description.substring(0, 47)}...` 
            : issue.description;
        
        // 确保正确设置 contextValue
        this.contextValue = issue.status === 'open' ? 'openIssue' : 
                           issue.status === 'fixed' ? 'fixedIssue' : 
                           issue.status === 'approved' ? 'approvedIssue' : 'wontfixIssue';
        
        // 设置图标
        this.iconPath = getStatusIcon(issue.status);
        
        // 添加命令，使点击时跳转到对应的代码位置
        this.command = {
            command: 'code-river.openIssueLocation',
            title: '打开问题位置',
            arguments: [this.issue]
        };
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
