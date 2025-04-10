import * as vscode from 'vscode';

export type IssueStatus = 'open' | 'fixed' | 'wontfix' | 'approved';

export interface IssueReply {
    id: string;
    content: string;
    author: string;
    createdAt: number;
}

export interface CodeReviewIssue {
    id: string;
    filePath: string;
    lineNumber: number;
    description: string;
    status: IssueStatus;
    createdAt: number;
    updatedAt: number;
    replies: IssueReply[];
    author?: string;
}

export function getStatusLabel(status: IssueStatus): string {
    switch (status) {
        case 'open':
            return '待解决';
        case 'fixed':
            return '已修复';
        case 'wontfix':
            return '不修复';
        case 'approved':
            return '已同意';
        default:
            return status;
    }
}

export function getStatusIcon(status: IssueStatus): string {
    switch (status) {
        case 'open':
            return '$(issues)';
        case 'fixed':
            return '$(check)';
        case 'wontfix':
            return '$(circle-slash)';
        case 'approved':
            return '$(thumbsup)';
        default:
            return '$(question)';
    }
}
