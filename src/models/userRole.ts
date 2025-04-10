export enum UserRole {
    Admin = 'admin',      // 最高权限用户（通常是项目管理员或团队负责人）
    Reviewer = 'reviewer', // 被邀请审核的人员
    Author = 'author',    // 代码作者
    Regular = 'regular'   // 普通用户
}

export interface UserPermission {
    canDelete: boolean;   // 是否可以删除评审
    canResolve: boolean;  // 是否可以标记为已解决
    canApprove: boolean;  // 是否可以同意评审
    canCreate: boolean;   // 是否可以创建评审
    canReply: boolean;    // 是否可以回复评审
}

export const rolePermissions: Record<UserRole, UserPermission> = {
    [UserRole.Admin]: {
        canDelete: true,
        canResolve: true,
        canApprove: true,
        canCreate: true,
        canReply: true
    },
    [UserRole.Reviewer]: {
        canDelete: false,
        canResolve: false,
        canApprove: true,
        canCreate: true,
        canReply: true
    },
    [UserRole.Author]: {
        canDelete: false,
        canResolve: true,
        canApprove: false,
        canCreate: true,
        canReply: true
    },
    [UserRole.Regular]: {
        canDelete: false,
        canResolve: false,
        canApprove: false,
        canCreate: true,
        canReply: true
    }
};
