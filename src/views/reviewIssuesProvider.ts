import * as vscode from 'vscode';
import * as path from 'path';
import { IssueStorage } from '../services/issueStorage';
import { IssueTreeItem, ReplyTreeItem } from './issueProvider';
import { CodeReviewIssue } from '../models/codeReviewIssue';
import { UserService } from '../services/userService';

export class ReviewIssuesProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
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
        vscode.commands.executeCommand('setContext', 'code-river.reviewIssues.hasChanges', value);
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
            return this.getReviewIssues();
        }
    }

    private async getReviewIssues(): Promise<IssueTreeItem[]> {
        const issues = await this.issueStorage.getIssues();
        const userRole = await this.userService.getCurrentUserRole();
        
        // 只有管理员和审核者可以看到所有评审
        if (userRole !== 'admin' && userRole !== 'reviewer') {
            return [];
        }

        return issues.map(issue => new IssueTreeItem(issue, vscode.TreeItemCollapsibleState.Collapsed));
    }

    private getIssueReplies(issue: CodeReviewIssue): ReplyTreeItem[] {
        if (!issue.replies || issue.replies.length === 0) {
            return [];
        }

        return issue.replies.map(reply => new ReplyTreeItem(reply, issue, vscode.TreeItemCollapsibleState.None));
    }
}
