import * as vscode from 'vscode';
import * as fs from 'fs';
import { CodeReviewIssue, IssueReply } from './models/codeReviewIssue';
import { IssueProvider, IssueTreeItem, ReplyTreeItem } from './views/issueProvider';
import { MyIssuesProvider } from './views/myIssuesProvider';
import { ReviewIssuesProvider } from './views/reviewIssuesProvider';
import { CreatedByMeProvider } from './views/createdByMeProvider';
import { IssueStorage } from './services/issueStorage';
import { GitService } from './services/gitService';
import { GitUserService } from './services/gitUserService';
import { UserService } from './services/userService';
import { UserRole } from './models/userRole';
import { InviteUserPanel } from './views/inviteUserPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "code-river" is now active!');

    // 初始化服务
    const issueStorage = new IssueStorage(context);
    const gitService = new GitService();
    const gitUserService = new GitUserService();
    const userService = new UserService(gitUserService);
    
    // 检查用户名设置并尝试从Git获取
    checkAndSetUserName(gitUserService);
    
    // 初始化视图
    const issueProvider = new IssueProvider(issueStorage);
    const myIssuesProvider = new MyIssuesProvider(issueStorage, userService);
    const reviewIssuesProvider = new ReviewIssuesProvider(issueStorage, userService);
    const createdByMeProvider = new CreatedByMeProvider(issueStorage);
    
    // 创建树视图
    const myIssuesTreeView = vscode.window.createTreeView('code-river.myIssues', {
        treeDataProvider: myIssuesProvider
    });
    
    const reviewIssuesTreeView = vscode.window.createTreeView('code-river.reviewIssues', {
        treeDataProvider: reviewIssuesProvider
    });
    
    const createdByMeTreeView = vscode.window.createTreeView('code-river.createdByMe', {
        treeDataProvider: createdByMeProvider
    });

    // 添加一个函数来检查用户名是否已设置
    async function ensureUserNameSet(): Promise<string | null> {
        // 获取当前配置的用户名
        const config = vscode.workspace.getConfiguration('codeRiver');
        const userName = config.get('userName', '');
        
        // 如果已经设置了用户名，则直接返回
        if (userName) {
            return userName;
        }
        
        // 尝试从Git获取用户名
        const gitUserName = await gitUserService.getGitUserName();
        
        if (gitUserName) {
            // 如果成功获取到Git用户名，提示用户是否使用
            const selection = await vscode.window.showInformationMessage(
                `检测到Git用户名: ${gitUserName}，是否用于代码评审?`,
                '使用', '手动设置', '暂不设置'
            );
            
            if (selection === '使用') {
                // 自动设置Git用户名
                await config.update('userName', gitUserName, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`已设置用户名为: ${gitUserName}`);
                return gitUserName;
            } else if (selection === '手动设置') {
                // 打开设置页面，但不显示额外提示
                await vscode.commands.executeCommand('workbench.action.openSettings', 'codeRiver.userName');
                // 返回特殊值，表示用户正在设置
                return 'SETTING';
            } else {
                // 用户选择暂不设置，返回默认用户名
                return '未知用户';
            }
        } else {
            // 如果没有获取到Git用户名，提示手动设置
            const selection = await vscode.window.showInformationMessage(
                '请设置您的用户名以便在代码评审中标识您的身份', 
                '现在设置', '暂不设置'
            );
            
            if (selection === '现在设置') {
                // 打开设置页面，但不显示额外提示
                await vscode.commands.executeCommand('workbench.action.openSettings', 'codeRiver.userName');
                // 返回特殊值，表示用户正在设置
                return 'SETTING';
            } else {
                // 用户选择暂不设置，返回默认用户名
                return '未知用户';
            }
        }
    }

    // 注册添加代码评审问题的命令
    // 在 activate 函数中添加以下代码
    
    // 注册同步命令
    const syncMyIssuesCommand = vscode.commands.registerCommand('code-river.syncMyIssues', async () => {
        // 获取所有问题并同步到 Git
        const issues = await issueStorage.getIssues();
        await gitService.syncIssuesToGit(issues);
        
        myIssuesProvider.refresh();
        myIssuesProvider.setHasChanges(false);
        vscode.window.showInformationMessage('已同步我的问题');
    });
    
    const syncReviewIssuesCommand = vscode.commands.registerCommand('code-river.syncReviewIssues', async () => {
        // 获取所有问题并同步到 Git
        const issues = await issueStorage.getIssues();
        await gitService.syncIssuesToGit(issues);
        
        reviewIssuesProvider.refresh();
        reviewIssuesProvider.setHasChanges(false);
        vscode.window.showInformationMessage('已同步待审核问题');
    });
    
    const syncCreatedByMeCommand = vscode.commands.registerCommand('code-river.syncCreatedByMe', async () => {
        // 获取所有问题并同步到 Git
        const issues = await issueStorage.getIssues();
        await gitService.syncIssuesToGit(issues);
        
        createdByMeProvider.refresh();
        createdByMeProvider.setHasChanges(false);
        vscode.window.showInformationMessage('已同步我创建的问题');
    });
    
    // 注册邀请评审者命令
    const inviteReviewerCommand = vscode.commands.registerCommand('code-river.inviteReviewer', async (item) => {
        if (!item || !item.issue) {
            return;
        }
        
        // 打开邀请用户面板
        await InviteUserPanel.create(gitUserService, userService, item.issue.id);
    });
    
    // 修改添加问题的命令，确保设置 hasChanges 标志
    const addIssueCommand = vscode.commands.registerCommand('code-river.addIssue', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('请先打开一个文件');
            return;
        }

        // 确保用户名已设置
        const userName = await ensureUserNameSet();
        if (userName === 'SETTING' || userName === null) {
            // 用户正在设置用户名或选择暂不设置，直接返回
            return;
        }

        const description = await vscode.window.showInputBox({
            prompt: '请输入问题描述',
            placeHolder: '描述代码问题...'
        });

        if (!description) {
            return;
        }

        const issue: CodeReviewIssue = {
            id: Date.now().toString(),
            filePath: editor.document.uri.fsPath,
            lineNumber: editor.selection.active.line,
            description,
            status: 'open',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            replies: [],
            author: userName
        };

        // 保存问题
        await issueStorage.saveIssue(issue);
        
        // 设置更改标志
        myIssuesProvider.setHasChanges(true);
        reviewIssuesProvider.setHasChanges(true);
        createdByMeProvider.setHasChanges(true);
        
        // 显示问题已添加的消息
        vscode.window.showInformationMessage(`已添加代码评审问题: ${description}`);
        
        // 刷新所有视图
        myIssuesProvider.refresh();
        reviewIssuesProvider.refresh();
        createdByMeProvider.refresh();
    });

    // 注册查看所有问题的命令
    const viewIssuesCommand = vscode.commands.registerCommand('code-river.viewIssues', () => {
        vscode.commands.executeCommand('code-river.myIssues.focus');
    });

    // 注册Git同步命令
    const syncWithGitCommand = vscode.commands.registerCommand('code-river.syncWithGit', async () => {
        const issues = await issueStorage.getIssues();
        await gitService.syncIssuesToGit(issues);
        
        // 刷新所有视图
        myIssuesProvider.refresh();
        reviewIssuesProvider.refresh();
        createdByMeProvider.refresh();
    });

    // 注册解决问题的命令
    const resolveIssueCommand = vscode.commands.registerCommand('code-river.resolveIssue', async (item) => {
        if (!item || !item.issue) {
            return;
        }
        
        const issue = item.issue;
        
        // 检查权限
        const permissions = await userService.getUserPermissions(issue.filePath);
        if (!permissions.canResolve) {
            vscode.window.showErrorMessage('您没有权限标记此问题为已解决');
            return;
        }
        
        issue.status = 'fixed';
        issue.updatedAt = Date.now();
        
        await issueStorage.saveIssue(issue);
        
        // 设置更改标志
        myIssuesProvider.setHasChanges(true);
        reviewIssuesProvider.setHasChanges(true);
        createdByMeProvider.setHasChanges(true);
        
        // 刷新所有视图
        myIssuesProvider.refresh();
        reviewIssuesProvider.refresh();
        createdByMeProvider.refresh();
        
        vscode.window.showInformationMessage(`问题已标记为已解决: ${issue.description}`);
    });

    // 注册同意问题的命令
    const approveIssueCommand = vscode.commands.registerCommand('code-river.approveIssue', async (item) => {
        if (!item || !item.issue) {
            return;
        }
        
        const issue = item.issue;
        
        // 检查权限
        const permissions = await userService.getUserPermissions(issue.filePath);
        if (!permissions.canApprove) {
            vscode.window.showErrorMessage('您没有权限同意此评审问题');
            return;
        }
        
        issue.status = 'approved';
        issue.updatedAt = Date.now();
        
        await issueStorage.saveIssue(issue);
        
        // 设置更改标志
        myIssuesProvider.setHasChanges(true);
        reviewIssuesProvider.setHasChanges(true);
        createdByMeProvider.setHasChanges(true);
        
        // 刷新所有视图
        myIssuesProvider.refresh();
        reviewIssuesProvider.refresh();
        createdByMeProvider.refresh();
        
        vscode.window.showInformationMessage(`问题已标记为已同意: ${issue.description}`);
    });

    // 注册回复问题的命令
    const replyToIssueCommand = vscode.commands.registerCommand('code-river.replyToIssue', async (item) => {
        if (!item) {
            return;
        }
        
        // 确保用户名已设置
        const userName = await ensureUserNameSet();
        if (userName === 'SETTING' || userName === null) {
            // 用户正在设置用户名或选择暂不设置，直接返回
            return;
        }
        
        let issue: CodeReviewIssue;
        
        if (item instanceof IssueTreeItem) {
            issue = item.issue;
        } else if (item instanceof ReplyTreeItem) {
            issue = item.parentIssue;
        } else {
            return;
        }
        
        const replyContent = await vscode.window.showInputBox({
            prompt: '请输入回复内容',
            placeHolder: '回复...'
        });
        
        if (!replyContent) {
            return;
        }
        
        const reply: IssueReply = {
            id: Date.now().toString(),
            content: replyContent,
            author: userName,
            createdAt: Date.now()
        };
        
        if (!issue.replies) {
            issue.replies = [];
        }
        
        issue.replies.push(reply);
        issue.updatedAt = Date.now();
        
        await issueStorage.saveIssue(issue);
        
        // 设置更改标志
        myIssuesProvider.setHasChanges(true);
        reviewIssuesProvider.setHasChanges(true);
        createdByMeProvider.setHasChanges(true);
        
        // 刷新所有视图
        myIssuesProvider.refresh();
        reviewIssuesProvider.refresh();
        createdByMeProvider.refresh();
        
        vscode.window.showInformationMessage(`已回复问题`);
    });

    // 注册删除问题的命令
    const deleteIssueCommand = vscode.commands.registerCommand('code-river.deleteIssue', async (item) => {
        if (!item || !item.issue) {
            return;
        }
        
        const issue = item.issue;
        
        // 检查权限
        const permissions = await userService.getUserPermissions(issue.filePath);
        if (!permissions.canDelete) {
            vscode.window.showErrorMessage('您没有权限删除此评审问题');
            return;
        }
        
        // 确认是否删除
        const confirmation = await vscode.window.showWarningMessage(
            `确定要删除此评审问题吗？\n${issue.description}`, 
            { modal: true },
            '确定', '取消'
        );
        
        if (confirmation !== '确定') {
            return;
        }
        
        // 删除问题
        await issueStorage.deleteIssue(issue.id);
        
        // 设置更改标志
        myIssuesProvider.setHasChanges(true);
        reviewIssuesProvider.setHasChanges(true);
        createdByMeProvider.setHasChanges(true);
        
        // 刷新所有视图
        myIssuesProvider.refresh();
        reviewIssuesProvider.refresh();
        createdByMeProvider.refresh();
        
        vscode.window.showInformationMessage(`已删除评审问题`);
    });

    // 添加设置管理员的命令 - 移到 activate 函数内部
    const setAdminCommand = vscode.commands.registerCommand('code-river.setAdmin', async () => {
        const userName = await vscode.window.showInputBox({
            prompt: '请输入要设置为管理员的用户名',
            placeHolder: '用户名...'
        });
        
        if (!userName) {
            return;
        }
        
        const success = await userService.addAdmin(userName);
        if (success) {
            vscode.window.showInformationMessage(`已将 ${userName} 设置为管理员`);
        } else {
            vscode.window.showInformationMessage(`${userName} 已经是管理员`);
        }
    });

    // 添加设置审核者的命令 - 移到 activate 函数内部
    const setReviewerCommand = vscode.commands.registerCommand('code-river.setReviewer', async () => {
        const userName = await vscode.window.showInputBox({
            prompt: '请输入要设置为审核者的用户名',
            placeHolder: '用户名...'
        });
        
        if (!userName) {
            return;
        }
        
        const success = await userService.addReviewer(userName);
        if (success) {
            vscode.window.showInformationMessage(`已将 ${userName} 设置为审核者`);
        } else {
            vscode.window.showInformationMessage(`${userName} 已经是审核者`);
        }
    });

    // 将所有命令添加到订阅列表
    context.subscriptions.push(
        addIssueCommand,
        viewIssuesCommand,
        syncWithGitCommand,
        resolveIssueCommand,
        approveIssueCommand,
        replyToIssueCommand,
        deleteIssueCommand,
        setAdminCommand,
        setReviewerCommand,
        syncMyIssuesCommand,
        syncReviewIssuesCommand,
        syncCreatedByMeCommand,
        inviteReviewerCommand,
        openIssueLocationCommand,
        myIssuesTreeView,
        reviewIssuesTreeView,
        createdByMeTreeView
    );
}

// 检查并设置用户名
async function checkAndSetUserName(gitUserService: GitUserService): Promise<void> {
    // 获取当前配置的用户名
    const config = vscode.workspace.getConfiguration('codeRiver');
    const userName = config.get('userName', '');
    
    // 如果已经设置了用户名，则不需要操作
    if (userName) {
        return;
    }
    
    // 尝试从Git获取用户名
    const gitUserName = await gitUserService.getGitUserName();
    
    if (gitUserName) {
        // 如果成功获取到Git用户名，提示用户是否使用
        const selection = await vscode.window.showInformationMessage(
            `检测到Git用户名: ${gitUserName}，是否用于代码评审?`,
            '使用', '手动设置', '暂不设置'
        );
        
        if (selection === '使用') {
            // 自动设置Git用户名
            await config.update('userName', gitUserName, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`已设置用户名为: ${gitUserName}`);
        } else if (selection === '手动设置') {
            // 打开设置页面
            vscode.commands.executeCommand('workbench.action.openSettings', 'codeRiver.userName');
        }
    } else {
        // 如果没有获取到Git用户名，提示手动设置
        vscode.window.showInformationMessage(
            '请设置您的用户名以便在代码评审中标识您的身份', 
            '现在设置'
        ).then(selection => {
            if (selection === '现在设置') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'codeRiver.userName');
            }
        });
    }
}

// 注册打开问题位置的命令
const openIssueLocationCommand = vscode.commands.registerCommand('code-river.openIssueLocation', async (issue: CodeReviewIssue) => {
    try {
        // 检查文件是否存在
        if (!fs.existsSync(issue.filePath)) {
            vscode.window.showErrorMessage(`文件不存在: ${issue.filePath}`);
            return;
        }
        
        // 打开文件
        const document = await vscode.workspace.openTextDocument(issue.filePath);
        const editor = await vscode.window.showTextDocument(document);
        
        // 跳转到指定行
        const lineNumber = Math.min(issue.lineNumber, document.lineCount - 1);
        const position = new vscode.Position(lineNumber, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(
            new vscode.Range(position, position),
            vscode.TextEditorRevealType.InCenter
        );
    } catch (error) {
        console.error('打开问题位置失败:', error);
        vscode.window.showErrorMessage(`打开问题位置失败: ${error}`);
    }
});

export function deactivate() {}
