import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as util from 'util';
import { CodeReviewIssue } from '../models/codeReviewIssue';

export class GitService {
    constructor() {}

    async syncIssuesToGit(issues: CodeReviewIssue[]): Promise<boolean> {
        try {
            const syncMethod = vscode.workspace.getConfiguration('codeRiver.gitIntegration').get<string>('syncMethod', 'comments');
            
            // 过滤掉不存在的文件
            const validIssues = await this.filterValidIssues(issues);
            
            if (validIssues.length === 0) {
                vscode.window.showWarningMessage('没有找到有效的代码评审问题可同步');
                return false;
            }
            
            // 保存到项目的特定文件中
            await this.saveIssuesToProjectFile(validIssues);
            
            // 保存到 .code-river/issues.json 文件
            await this.saveIssuesToCodeRiverDir(issues);
            
            if (syncMethod === 'issues' || syncMethod === 'both') {
                await this.syncAsIssues(validIssues);
            }
            
            vscode.window.showInformationMessage('代码评审问题已同步到Git');
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`同步到Git失败: ${error}`);
            return false;
        }
    }

    // 新增：过滤有效的问题（文件存在的问题）
    private async filterValidIssues(issues: CodeReviewIssue[]): Promise<CodeReviewIssue[]> {
        const validIssues: CodeReviewIssue[] = [];
        
        for (const issue of issues) {
            try {
                // 检查文件是否存在
                if (fs.existsSync(issue.filePath)) {
                    validIssues.push(issue);
                } else {
                    console.log(`文件不存在，跳过同步: ${issue.filePath}`);
                }
            } catch (error) {
                console.error(`检查文件时出错: ${issue.filePath}`, error);
            }
        }
        
        return validIssues;
    }

    // 新增：将评论保存到项目特定文件中
    private async saveIssuesToProjectFile(issues: CodeReviewIssue[]): Promise<void> {
        try {
            // 获取工作区根目录
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                throw new Error('未打开工作区');
            }
            
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const codeRiverDir = path.join(workspaceRoot, '.code-river');
            
            // 使用工作区名称作为文件名的一部分，确保不同项目的评论分开存储
            const workspaceName = path.basename(workspaceRoot);
            const commentsFile = path.join(codeRiverDir, `comments-${workspaceName}.json`);
            
            // 确保目录存在
            if (!fs.existsSync(codeRiverDir)) {
                fs.mkdirSync(codeRiverDir, { recursive: true });
            }
            
            // 创建新的评论集合
            const newComments: Record<string, CodeReviewIssue[]> = {};
            
            // 只处理当前工作区内的评论
            const workspaceIssues = issues.filter(issue => {
                return issue.filePath.startsWith(workspaceRoot);
            });
            
            // 按文件路径组织当前有效的评论
            for (const issue of workspaceIssues) {
                const relativePath = path.relative(workspaceRoot, issue.filePath);
                if (!newComments[relativePath]) {
                    newComments[relativePath] = [];
                }
                newComments[relativePath].push(issue);
            }
            
            // 写入文件 - 只保存当前工作区的评论
            fs.writeFileSync(commentsFile, JSON.stringify(newComments, null, 2));
            
            // 创建一个README文件，解释这个目录的用途
            const readmePath = path.join(codeRiverDir, 'README.md');
            if (!fs.existsSync(readmePath)) {
                const readmeContent = `# Code River 评审问题\n\n这个目录包含由 Code River 扩展生成的代码评审问题。请不要手动修改这些文件。`;
                fs.writeFileSync(readmePath, readmeContent);
            }
            
            // 创建.gitignore文件，确保不会忽略这个目录
            const gitignorePath = path.join(workspaceRoot, '.gitignore');
            if (fs.existsSync(gitignorePath)) {
                const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');
                if (gitignoreContent.includes('.code-river')) {
                    // 如果.gitignore包含.code-river，则移除它
                    const newContent = gitignoreContent
                        .split('\n')
                        .filter(line => !line.trim().startsWith('.code-river'))
                        .join('\n');
                    fs.writeFileSync(gitignorePath, newContent);
                }
            }
            
            vscode.window.showInformationMessage(`评审问题已保存到 ${commentsFile}`);
        } catch (error) {
            console.error('保存评论到项目文件失败:', error);
            throw error;
        }
    }

    // 新增：将问题保存到 .code-river 目录
    private async saveIssuesToCodeRiverDir(issues: CodeReviewIssue[]): Promise<void> {
        try {
            // 获取工作区根目录
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                throw new Error('未打开工作区');
            }
            
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            const codeRiverDir = path.join(workspaceRoot, '.code-river');
            
            // 确保 .code-river 目录存在
            if (!fs.existsSync(codeRiverDir)) {
                fs.mkdirSync(codeRiverDir, { recursive: true });
            }
            
            // 将问题保存到文件
            const issuesFile = path.join(codeRiverDir, 'issues.json');
            fs.writeFileSync(issuesFile, JSON.stringify(issues, null, 2), 'utf8');
            
            console.log(`已将 ${issues.length} 个问题同步到 ${issuesFile}`);
            
            // 尝试将文件添加到 Git
            try {
                const exec = util.promisify(cp.exec);
                await exec(`git add "${issuesFile}"`, { cwd: workspaceRoot });
                console.log('已将问题文件添加到Git暂存区');
            } catch (error) {
                console.error('添加文件到Git失败:', error);
                // 不阻止流程继续，因为用户可能没有使用Git
            }
        } catch (error) {
            console.error('同步问题到Git失败:', error);
            throw error;
        }
    }

    private async syncAsComments(issues: CodeReviewIssue[]): Promise<void> {
        // 这个方法不再使用，保留以兼容旧代码
        vscode.window.showInformationMessage('评论已保存到项目文件中，不再直接添加到代码中');
    }

    private async syncAsIssues(issues: CodeReviewIssue[]): Promise<void> {
        // 实现将问题作为GitHub/GitLab Issues同步的逻辑
        // 这可能需要使用相应平台的API
        
        // 这里需要根据您使用的Git平台（如GitHub、GitLab等）来实现
        vscode.window.showInformationMessage('同步到Git Issues功能尚未实现');
    }

    // 保留这个方法以备将来使用，但不再在syncIssuesToGit中调用它
    private async addCommentToFile(issue: CodeReviewIssue): Promise<void> {
        try {
            // 再次检查文件是否存在
            if (!fs.existsSync(issue.filePath)) {
                throw new Error(`文件不存在: ${issue.filePath}`);
            }
            
            const document = await vscode.workspace.openTextDocument(issue.filePath);
            const edit = new vscode.WorkspaceEdit();
            
            // 确保行号有效
            const lineCount = document.lineCount;
            const lineNumber = Math.min(issue.lineNumber, lineCount - 1);
            
            const line = document.lineAt(lineNumber);
            const indentation = line.text.match(/^\s*/)?.[0] || '';
            
            const template = vscode.workspace.getConfiguration('codeRiver').get<string>('issueTemplate', 
                '问题：{description}\n位置：{file}:{line}\n状态：{status}');
            
            const comment = template
                .replace('{description}', issue.description)
                .replace('{file}', path.basename(issue.filePath))
                .replace('{line}', (lineNumber + 1).toString())
                .replace('{status}', issue.status)
                .split('\n')
                .map(line => `${indentation}// ${line}`)
                .join('\n');
            
            edit.insert(
                vscode.Uri.file(issue.filePath),
                new vscode.Position(lineNumber, 0),
                comment + '\n'
            );
            
            await vscode.workspace.applyEdit(edit);
        } catch (error) {
            console.error('Failed to add comment to file:', error);
            throw error;
        }
    }
}
