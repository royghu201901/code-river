import * as vscode from 'vscode';
import { GitUserService } from '../services/gitUserService';
import { UserService } from '../services/userService';
import { GitUser } from '../models/gitUser';

export class InviteUserPanel {
    public static currentPanel: InviteUserPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    
    private constructor(
        panel: vscode.WebviewPanel,
        private readonly gitUserService: GitUserService,
        private readonly userService: UserService,
        private readonly issueId: string
    ) {
        this._panel = panel;
        
        // 设置WebView内容
        this._update();
        
        // 监听面板关闭事件
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        
        // 监听WebView消息
        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'inviteUser':
                        await this.userService.inviteReviewer(message.userName);
                        vscode.window.showInformationMessage(`已邀请 ${message.userName} 参与评审`);
                        this._panel.dispose();
                        break;
                    case 'close':
                        this._panel.dispose();
                        break;
                }
            },
            null,
            this._disposables
        );
    }
    
    public static async create(
        gitUserService: GitUserService,
        userService: UserService,
        issueId: string
    ): Promise<InviteUserPanel> {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
            
        // 创建WebView面板
        const panel = vscode.window.createWebviewPanel(
            'inviteUserPanel',
            '邀请用户参与评审',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );
        
        return new InviteUserPanel(panel, gitUserService, userService, issueId);
    }
    
    private async _update() {
        const webview = this._panel.webview;
        
        // 获取Git用户列表
        const gitUsers = await this.gitUserService.getAllGitUsers();
        const reviewers = this.userService.getReviewers();
        
        webview.html = this._getHtmlForWebview(webview, gitUsers, reviewers);
    }
    
    private _getHtmlForWebview(webview: vscode.Webview, gitUsers: GitUser[], reviewers: string[]): string {
        // 创建HTML内容
        return `<!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>邀请用户参与评审</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                }
                .container {
                    max-width: 600px;
                    margin: 0 auto;
                }
                .header {
                    margin-bottom: 20px;
                }
                .user-list {
                    margin-top: 20px;
                }
                .user-item {
                    display: flex;
                    align-items: center;
                    padding: 10px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    cursor: pointer;
                }
                .user-item:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .user-avatar {
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    margin-right: 10px;
                }
                .user-info {
                    flex: 1;
                }
                .user-name {
                    font-weight: bold;
                }
                .user-email {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
                .user-status {
                    font-size: 0.8em;
                    padding: 2px 6px;
                    border-radius: 10px;
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                }
                .manual-input {
                    margin-top: 20px;
                    padding: 10px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                }
                input {
                    width: 100%;
                    padding: 8px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                }
                button {
                    margin-top: 10px;
                    padding: 8px 16px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>邀请用户参与评审</h2>
                    <p>选择一个用户或手动输入用户名</p>
                </div>
                
                <div class="user-list">
                    <h3>项目贡献者</h3>
                    ${gitUsers.map(user => `
                        <div class="user-item" onclick="inviteUser('${user.name}')">
                            <img class="user-avatar" src="${user.avatarUrl}" alt="${user.name}">
                            <div class="user-info">
                                <div class="user-name">${user.name}</div>
                                <div class="user-email">${user.email}</div>
                            </div>
                            ${reviewers.includes(user.name) ? 
                                '<div class="user-status">已邀请</div>' : ''}
                        </div>
                    `).join('')}
                </div>
                
                <div class="manual-input">
                    <h3>手动输入用户名</h3>
                    <input type="text" id="userName" placeholder="输入用户名...">
                    <button onclick="inviteManualUser()">邀请</button>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                
                function inviteUser(userName) {
                    vscode.postMessage({
                        command: 'inviteUser',
                        userName: userName
                    });
                }
                
                function inviteManualUser() {
                    const userName = document.getElementById('userName').value.trim();
                    if (userName) {
                        vscode.postMessage({
                            command: 'inviteUser',
                            userName: userName
                        });
                    }
                }
            </script>
        </body>
        </html>`;
    }
    
    public dispose() {
        InviteUserPanel.currentPanel = undefined;
        
        this._panel.dispose();
        
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}
