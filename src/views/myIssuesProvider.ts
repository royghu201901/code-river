import * as vscode from 'vscode';
import * as path from 'path';
import { IssueStorage } from '../services/issueStorage';
import { IssueTreeItem, ReplyTreeItem } from './issueProvider';
import { CodeReviewIssue, IssueReply } from '../models/codeReviewIssue';
import { UserService } from '../services/userService';

export class MyIssuesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    
    // 添加一个标志，表示是否有未同步的更改
    private _hasChanges: boolean = false;

    constructor(
        private issueStorage: IssueStorage,
        private userService: UserService
    ) {}

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
    
    // 添加设置更改标志的方法
    public setHasChanges(value: boolean): void {
        this._hasChanges = value;
        // 更新上下文，使同步按钮显示/隐藏
        vscode.commands.executeCommand('setContext', 'code-river.myIssues.hasChanges', value);
    }
    
    // 添加获取更改标志的方法
    public hasChanges(): boolean {
        return this._hasChanges;
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (element) {
            if (element instanceof IssueTreeItem) {
                return this.getIssueReplies(element.issue);
            }
            return [];
        } else {
            return this.getMyIssues();
        }
    }

    private async getMyIssues(): Promise<IssueTreeItem[]> {
        const issues = await this.issueStorage.getIssues();
        const userName = vscode.workspace.getConfiguration('codeRiver').get<string>('userName', '');
        
        if (!userName) {
            return [];
        }

        // 获取与当前用户相关的问题（作为作者或者文件作者）
        const myIssues: CodeReviewIssue[] = [];
        
        for (const issue of issues) {
            // 检查是否是文件作者
            const isAuthor = await this.userService.getCurrentUserRole(issue.filePath) === 'author';
            
            // 如果是文件作者或者评审作者，则添加到列表
            if (isAuthor || issue.author === userName) {
                myIssues.push(issue);
            }
        }

        return myIssues.map(issue => new IssueTreeItem(issue, vscode.TreeItemCollapsibleState.Collapsed));
    }

    private getIssueReplies(issue: CodeReviewIssue): ReplyTreeItem[] {
        if (!issue.replies || issue.replies.length === 0) {
            return [];
        }

        return issue.replies.map(reply => new ReplyTreeItem(reply, issue, vscode.TreeItemCollapsibleState.None));
    }
}
