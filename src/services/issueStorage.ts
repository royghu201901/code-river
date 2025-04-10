import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CodeReviewIssue } from '../models/codeReviewIssue';

export class IssueStorage {
    private storagePath: string;
    private issuesFilePath: string;

    constructor(private context: vscode.ExtensionContext) {
        this.storagePath = context.globalStoragePath;
        this.issuesFilePath = path.join(this.storagePath, 'issues.json');
        
        // 确保存储目录存在
        if (!fs.existsSync(this.storagePath)) {
            fs.mkdirSync(this.storagePath, { recursive: true });
        }
    }

    async saveIssue(issue: CodeReviewIssue): Promise<void> {
        const issues = await this.getIssues();
        
        const existingIssueIndex = issues.findIndex(i => i.id === issue.id);
        if (existingIssueIndex >= 0) {
            issues[existingIssueIndex] = issue;
        } else {
            issues.push(issue);
        }
        
        await fs.promises.writeFile(this.issuesFilePath, JSON.stringify(issues, null, 2));
    }

    async getIssues(): Promise<CodeReviewIssue[]> {
        if (!fs.existsSync(this.issuesFilePath)) {
            return [];
        }
        
        const issuesData = await fs.promises.readFile(this.issuesFilePath, 'utf8');
        try {
            return JSON.parse(issuesData);
        } catch (error) {
            console.error('Failed to parse issues data:', error);
            return [];
        }
    }

    async deleteIssue(issueId: string): Promise<void> {
        const issues = await this.getIssues();
        const filteredIssues = issues.filter(issue => issue.id !== issueId);
        await fs.promises.writeFile(this.issuesFilePath, JSON.stringify(filteredIssues, null, 2));
    }
}
