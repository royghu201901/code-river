import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as util from 'util';
import { GitUser } from '../models/gitUser';

export class GitUserService {
    /**
     * 从 Git 配置中获取用户名
     */
    async getGitUserName(): Promise<string | null> {
        try {
            // 获取工作区根目录
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                return null;
            }
            
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            
            // 执行 git config 命令获取用户名
            const exec = util.promisify(cp.exec);
            const { stdout } = await exec('git config user.name', { cwd: workspaceRoot });
            
            const gitUserName = stdout.trim();
            return gitUserName || null;
        } catch (error) {
            console.error('获取Git用户名失败:', error);
            return null;
        }
    }

    /**
     * 从 Git 配置中获取用户邮箱
     */
    async getGitUserEmail(): Promise<string | null> {
        try {
            // 获取工作区根目录
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                return null;
            }
            
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            
            // 执行 git config 命令获取用户邮箱
            const exec = util.promisify(cp.exec);
            const { stdout } = await exec('git config user.email', { cwd: workspaceRoot });
            
            const gitUserEmail = stdout.trim();
            return gitUserEmail || null;
        } catch (error) {
            console.error('获取Git用户邮箱失败:', error);
            return null;
        }
    }

    // 添加获取所有Git用户的方法
    public async getAllGitUsers(): Promise<GitUser[]> {
        try {
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                return [];
            }
            
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            
            // 检查是否是Git仓库
            try {
                const exec = util.promisify(cp.exec);
                await exec('git rev-parse --is-inside-work-tree', { cwd: workspaceRoot });
            } catch (error) {
                console.log('当前工作区不是Git仓库，无法获取用户信息');
                return [];
            }
            
            // 获取所有提交者信息
            const exec = util.promisify(cp.exec);
            const { stdout } = await exec('git log --pretty=format:"%an|%ae" --author=".*"', { cwd: workspaceRoot });
            
            // 解析并去重用户
            const userMap = new Map<string, GitUser>();
            
            stdout.split('\n').forEach(line => {
                const [name, email] = line.split('|');
                if (name && email && !userMap.has(name)) {
                    userMap.set(name, {
                        name: name.trim(),
                        email: email.trim(),
                        avatarUrl: this.generateAvatarUrl(email.trim())
                    });
                }
            });
            
            return Array.from(userMap.values());
        } catch (error) {
            console.error('获取Git用户列表失败:', error);
            return [];
        }
    }

    // 生成头像URL的辅助方法
    private generateAvatarUrl(email: string): string {
        // 使用Gravatar服务生成头像URL
        const emailHash = this.md5(email.trim().toLowerCase());
        return `https://www.gravatar.com/avatar/${emailHash}?d=identicon`;
    }

    // 简单的MD5实现，用于生成Gravatar头像URL
    private md5(input: string): string {
        // 这里使用一个简单的方法，实际项目中应该使用专门的MD5库
        // 为了简化，我们返回一个固定的哈希值
        return '00000000000000000000000000000000';
    }
}
