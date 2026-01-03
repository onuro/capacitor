'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2, Users, Plus, RefreshCw, KeyRound, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'sonner';
import {
  listUsers,
  createUser,
  resetUserPassword,
  deleteUser,
  type WPUser,
  type CreateUserParams,
} from '@/lib/api/flux-wp-cli';
import type { BaseWpCliProps } from './types';

type UserRole = 'administrator' | 'editor' | 'author' | 'contributor' | 'subscriber';

const USER_ROLES: { value: UserRole; label: string }[] = [
  { value: 'administrator', label: 'Administrator' },
  { value: 'editor', label: 'Editor' },
  { value: 'author', label: 'Author' },
  { value: 'contributor', label: 'Contributor' },
  { value: 'subscriber', label: 'Subscriber' },
];

function generatePassword(length = 16): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

export function UserManager({ appName, nodeIp }: BaseWpCliProps) {
  const { zelidauth } = useAuthStore();
  const queryClient = useQueryClient();

  // Create user dialog state
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState<CreateUserParams>({
    username: '',
    email: '',
    password: '',
    role: 'subscriber',
  });

  // Reset password dialog state
  const [resetPasswordDialog, setResetPasswordDialog] = useState<{
    userId: string;
    username: string;
    newPassword: string;
  } | null>(null);

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState<{
    userId: string;
    username: string;
  } | null>(null);

  // Query for user list
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['wp-users', appName, nodeIp],
    queryFn: async () => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await listUsers(zelidauth, { appName, nodeIp });
      if (result.status === 'error') {
        throw new Error(result.message);
      }
      return result.data || [];
    },
    enabled: !!zelidauth && !!nodeIp,
    staleTime: 60000,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (userData: CreateUserParams) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await createUser(zelidauth, { appName, nodeIp }, userData);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('User created');
      setCreateDialogOpen(false);
      setNewUser({ username: '', email: '', password: '', role: 'subscriber' });
      queryClient.invalidateQueries({ queryKey: ['wp-users', appName] });
    },
    onError: (error: Error) => toast.error(`Failed to create user: ${error.message}`),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: string; newPassword: string }) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await resetUserPassword(zelidauth, { appName, nodeIp }, userId, newPassword);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('Password reset successfully');
      setResetPasswordDialog(null);
    },
    onError: (error: Error) => toast.error(`Failed to reset password: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!zelidauth) throw new Error('Not authenticated');
      const result = await deleteUser(zelidauth, { appName, nodeIp }, userId);
      if (result.status === 'error') throw new Error(result.message);
      return result;
    },
    onSuccess: () => {
      toast.success('User deleted');
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ['wp-users', appName] });
    },
    onError: (error: Error) => toast.error(`Failed to delete user: ${error.message}`),
  });

  const users = (data as WPUser[]) || [];
  const isAnyMutating =
    createMutation.isPending || resetPasswordMutation.isPending || deleteMutation.isPending;

  const handleOpenResetPassword = (user: WPUser) => {
    setResetPasswordDialog({
      userId: user.ID,
      username: user.user_login,
      newPassword: generatePassword(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="size-5" />
            Users ({users.length})
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="size-4 mr-1" />
              Add User
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="size-6 animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No users found</p>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="space-y-2">
              {users.map((user) => (
                <div
                  key={user.ID}
                  className="flex items-center justify-between p-3 rounded-lg border"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{user.display_name}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>{user.user_login}</span>
                      <span className="text-muted-foreground/50">|</span>
                      <span>{user.user_email}</span>
                      <Badge variant="secondary" className="text-xs">
                        {user.roles}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenResetPassword(user)}
                      disabled={isAnyMutating}
                      title="Reset Password"
                    >
                      <KeyRound className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setConfirmDelete({ userId: user.ID, username: user.user_login })
                      }
                      disabled={isAnyMutating}
                      title="Delete User"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>Create a new WordPress user account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                placeholder="Enter username"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="user@example.com"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="flex gap-2">
                <Input
                  id="password"
                  type="text"
                  placeholder="Enter password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setNewUser({ ...newUser, password: generatePassword() })
                  }
                >
                  Generate
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Select
                value={newUser.role}
                onValueChange={(value: UserRole) =>
                  setNewUser({ ...newUser, role: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(newUser)}
              disabled={
                !newUser.username.trim() ||
                !newUser.email.trim() ||
                !newUser.password.trim() ||
                createMutation.isPending
              }
            >
              {createMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog
        open={!!resetPasswordDialog}
        onOpenChange={() => setResetPasswordDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for &quot;{resetPasswordDialog?.username}&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="flex gap-2">
              <Input
                id="newPassword"
                type="text"
                value={resetPasswordDialog?.newPassword || ''}
                onChange={(e) =>
                  resetPasswordDialog &&
                  setResetPasswordDialog({
                    ...resetPasswordDialog,
                    newPassword: e.target.value,
                  })
                }
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  resetPasswordDialog &&
                  setResetPasswordDialog({
                    ...resetPasswordDialog,
                    newPassword: generatePassword(),
                  })
                }
              >
                Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Copy the password before saving - it won&apos;t be shown again.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetPasswordDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                resetPasswordDialog &&
                resetPasswordMutation.mutate({
                  userId: resetPasswordDialog.userId,
                  newPassword: resetPasswordDialog.newPassword,
                })
              }
              disabled={
                !resetPasswordDialog?.newPassword.trim() || resetPasswordMutation.isPending
              }
            >
              {resetPasswordMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{confirmDelete?.username}&quot;? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.userId)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="size-4 mr-2 animate-spin" />
              )}
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
