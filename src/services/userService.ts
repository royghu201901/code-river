import * as vscode from 'vscode';
import { GitUserService } from './gitUserService';
import { UserRole, rolePermissions, UserPermission } from '../models/userRole';
import * as cp from 'child_process';
import * as util from 'util';

export class UserService {
    private gitUserService: GitUserService;
    private adminUsers: string[] = [];
    private reviewers: string[] = [];
    private fileAuthors: Map<string, string[]> = new Map();

    constructor(gitUserService: GitUserService) {
        this.gitUserService = gitUserService;
        this.loadConfiguration();
    }

    private loadConfiguration(): void {
        const config = vscode.workspace.getConfiguration('codeRiver');
        
        // 读取管理员用户列表
        this.adminUsers = config.get<string[]>('adminUsers', []);
        console.log('已加载管理员用户列表:', this.adminUsers);
        
        // 读取审核者用户列表
        this.reviewers = config.get<string[]>('reviewers', []);
        console.log('已加载审核者用户列表:', this.reviewers);
        
        // 如果配置为空，尝试添加当前用户为管理员
        if (this.adminUsers.length === 0) {
            const userName = config.get<string>('userName', '');
            if (userName) {
                this.adminUsers.push(userName);
                console.log('自动将当前用户设为管理员:', userName);
                
                // 保存到配置 - 修复 catch 错误
                config.update('adminUsers', this.adminUsers, vscode.ConfigurationTarget.Global)
                    .then(() => console.log('已保存管理员配置'), 
                          err => console.error('保存管理员配置失败:', err));
            }
        }
    }

    // 添加一个方法来手动设置管理员
    public async addAdmin(userName: string): Promise<boolean> {
        if (!userName) return false;
        
        if (!this.adminUsers.includes(userName)) {
            this.adminUsers.push(userName);
            
            // 保存到配置
            const config = vscode.workspace.getConfiguration('codeRiver');
            await config.update('adminUsers', this.adminUsers, vscode.ConfigurationTarget.Global);
            console.log(`已将 ${userName} 添加为管理员`);
            return true;
        }
        
        return false;
    }

    // 添加一个方法来手动设置审核者
    public async addReviewer(userName: string): Promise<boolean> {
        if (!userName) return false;
        
        if (!this.reviewers.includes(userName)) {
            this.reviewers.push(userName);
            
            // 保存到配置
            const config = vscode.workspace.getConfiguration('codeRiver');
            await config.update('reviewers', this.reviewers, vscode.ConfigurationTarget.Global);
            console.log(`已将 ${userName} 添加为审核者`);
            return true;
        }
        
        return false;
    }

    public async getCurrentUserRole(filePath?: string): Promise<UserRole> {
        const userName = vscode.workspace.getConfiguration('codeRiver').get<string>('userName', '');
        
        if (!userName) {
            return UserRole.Regular;
        }

        // 检查是否是管理员
        if (this.adminUsers.includes(userName)) {
            return UserRole.Admin;
        }

        // 检查是否是审核者
        if (this.reviewers.includes(userName)) {
            return UserRole.Reviewer;
        }

        // 如果提供了文件路径，检查是否是文件作者
        if (filePath) {
            const isAuthor = await this.isFileAuthor(userName, filePath);
            if (isAuthor) {
                return UserRole.Author;
            }
        }

        return UserRole.Regular;
    }

    public async getUserPermissions(filePath?: string): Promise<UserPermission> {
        const role = await this.getCurrentUserRole(filePath);
        return rolePermissions[role];
    }

    private async isFileAuthor(userName: string, filePath: string): Promise<boolean> {
        try {
            // 检查缓存
            if (!this.fileAuthors.has(filePath)) {
                // 获取文件的Git作者
                const authors = await this.getFileAuthors(filePath);
                this.fileAuthors.set(filePath, authors);
            }

            const authors = this.fileAuthors.get(filePath) || [];
            return authors.includes(userName);
        } catch (error) {
            console.error('获取文件作者失败:', error);
            return false;
        }
    }

    private async getFileAuthors(filePath: string): Promise<string[]> {
        try {
            // 检查文件是否存在且在Git仓库中
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                return [];
            }
            
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            
            // 检查是否是未保存的文件
            if (filePath.includes('Untitled-') || !filePath.startsWith(workspaceRoot)) {
                console.log('文件未保存或不在工作区内，无法获取作者信息');
                return [];
            }
            
            // 检查是否是Git仓库
            try {
                const exec = util.promisify(cp.exec);
                await exec('git rev-parse --is-inside-work-tree', { cwd: workspaceRoot });
            } catch (error) {
                console.log('当前工作区不是Git仓库，无法获取作者信息');
                return [];
            }
            
            // 执行git命令获取文件的所有作者
            const exec = util.promisify(cp.exec);
            const { stdout } = await exec(`git log --pretty=format:"%an" -- "${filePath}"`, { cwd: workspaceRoot });
            
            // 解析并去重作者
            const authors = [...new Set(stdout.split('\n').map(line => line.trim()).filter(Boolean))];
            return authors;
        } catch (error) {
            console.error('获取文件作者失败:', error);
            return [];
        }
    }

    // 添加邀请审核者的方法
    public async inviteReviewer(userName: string): Promise<boolean> {
        if (!userName) return false;
        
        // 重新加载配置，确保获取最新数据
        this.loadConfiguration();
        
        if (!this.reviewers.includes(userName)) {
            this.reviewers.push(userName);
            
            // 保存到配置
            const config = vscode.workspace.getConfiguration('codeRiver');
            await config.update('reviewers', this.reviewers, vscode.ConfigurationTarget.Global);
            console.log(`已邀请 ${userName} 作为审核者`);
            return true;
        }
        
        return false;
    }

    // 获取所有审核者
    public getReviewers(): string[] {
        return [...this.reviewers];
    }

    // 检查用户是否已被邀请为审核者
    public isReviewer(userName: string): boolean {
        return this.reviewers.includes(userName);
    }
}
