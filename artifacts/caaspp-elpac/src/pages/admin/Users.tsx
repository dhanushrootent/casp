import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useListUsers, useCreateUser, useListClasses, useUpdateUser, getListUsersQueryKey, getListClassesQueryKey, User } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { Users, GraduationCap, BookOpen, Shield, Loader2, Plus, ChevronDown, Check } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui';

function AssignClassDropdown({ user }: { user: User }) {
  const { data: classes, isLoading } = useListClasses();
  const updateUserMutation = useUpdateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  if (user.role !== 'student' || !user.grade) return <span className="text-muted-foreground">—</span>;
  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />;

  const validClasses = classes?.filter(c => String(c.grade) === String(user.grade)) ?? [];
  const assignedClassIds = user.classIds || [];

  const handleToggleClass = async (classId: string) => {
    let newClassIds: string[];
    if (assignedClassIds.includes(classId)) {
      newClassIds = assignedClassIds.filter(id => id !== classId);
    } else {
      newClassIds = [...assignedClassIds, classId];
    }

    try {
      await updateUserMutation.mutateAsync({ userId: user.id, data: { classIds: newClassIds } });
      toast({ title: 'Classes updated successfully!' });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error updating classes', description: String(error) });
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-[10px] gap-1 px-2">
          Assign/Edit
          <ChevronDown className="w-3 h-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        <div className="space-y-1">
          <p className="text-[10px] font-bold px-2 py-1 text-muted-foreground uppercase tracking-wider">
            Grade {user.grade} Classes
          </p>
          <div className="max-h-[200px] overflow-y-auto">
            {validClasses.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2 text-center">No classes found</p>
            ) : (
              validClasses.map(cls => (
                <div 
                  key={cls.id} 
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => handleToggleClass(cls.id)}
                >
                  <Checkbox 
                    checked={assignedClassIds.includes(cls.id)} 
                    onCheckedChange={() => {}} 
                    className="pointer-events-none"
                  />
                  <span className="text-xs flex-1 truncate">{cls.name}</span>
                  {assignedClassIds.includes(cls.id) && <Check className="w-3 h-3 text-primary" />}
                </div>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const roleConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  student: { label: 'Student', color: 'bg-blue-100 text-blue-700', icon: GraduationCap },
  teacher: { label: 'Teacher', color: 'bg-purple-100 text-purple-700', icon: BookOpen },
  admin: { label: 'Admin', color: 'bg-amber-100 text-amber-700', icon: Shield },
};

export default function AdminUsers() {
  const [filterRole, setFilterRole] = useState<string>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    role: 'student' as 'student' | 'teacher' | 'admin',
    grade: ''
  });

  const { data: users, isLoading } = useListUsers({});
  const { data: classes } = useListClasses();
  const createUserMutation = useCreateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUserMutation.mutateAsync({
        data: {
          ...formData,
          grade: formData.role === 'student' ? formData.grade : undefined
        }
      });
      toast({ title: 'User created successfully!' });
      setIsDialogOpen(false);
      setFormData({ name: '', username: '', email: '', password: '', role: 'student', grade: '' });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error creating user', description: String(error) });
    }
  };

  const filtered = filterRole === 'all'
    ? (users ?? [])
    : (users ?? []).filter(u => u.role === filterRole);

  const counts = {
    all: users?.length ?? 0,
    student: users?.filter(u => u.role === 'student').length ?? 0,
    teacher: users?.filter(u => u.role === 'teacher').length ?? 0,
    admin: users?.filter(u => u.role === 'admin').length ?? 0,
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold mb-2">User Management</h1>
            <p className="text-muted-foreground text-lg">All students, teachers, and administrators</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Add New User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateUser} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input id="name" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input id="username" required value={formData.username} onChange={e => setFormData({ ...formData, username: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" required value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <select
                      id="role"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                      value={formData.role}
                      onChange={e => setFormData({ ...formData, role: e.target.value as any })}
                    >
                      <option value="student">Student</option>
                      <option value="teacher">Teacher</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                  {formData.role === 'student' && (
                    <div className="space-y-2">
                      <Label htmlFor="grade">Grade</Label>
                      <Input id="grade" required={formData.role === 'student'} value={formData.grade} onChange={e => setFormData({ ...formData, grade: e.target.value })} />
                    </div>
                  )}
                </div>
                <Button type="submit" className="w-full" disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(['all', 'student', 'teacher', 'admin'] as const).map(role => (
            <button
              key={role}
              onClick={() => setFilterRole(role)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${filterRole === role ? 'border-primary bg-primary/5' : 'border-border bg-white hover:border-primary/40'}`}
            >
              <p className="text-sm text-muted-foreground capitalize mb-1">{role === 'all' ? 'All Users' : `${role}s`}</p>
              <p className="text-2xl font-bold font-display">{counts[role]}</p>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="capitalize">{filterRole === 'all' ? 'All Users' : `${filterRole}s`} ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="text-left px-6 py-3 font-semibold text-muted-foreground">Name</th>
                      <th className="text-left px-6 py-3 font-semibold text-muted-foreground">Username</th>
                      <th className="text-left px-6 py-3 font-semibold text-muted-foreground">Email</th>
                      <th className="text-center px-6 py-3 font-semibold text-muted-foreground">Role</th>
                      <th className="text-center px-6 py-3 font-semibold text-muted-foreground">Grade</th>
                      <th className="text-center px-6 py-3 font-semibold text-muted-foreground">Class</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map(user => {
                      const config = roleConfig[user.role] ?? roleConfig.student;
                      const Icon = config.icon;
                      return (
                        <tr key={user.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                                {user.name.charAt(0)}
                              </div>
                              <span className="font-semibold">{user.name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-muted-foreground font-mono text-xs">{user.username}</td>
                          <td className="px-6 py-4 text-muted-foreground">{user.email}</td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${config.color}`}>
                              <Icon className="w-3 h-3" />
                              {config.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center text-muted-foreground text-xs font-medium">
                            {user.grade ? `Grade ${user.grade}` : '—'}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-col items-center gap-2">
                              {user.role === 'student' && user.grade && (
                                <div className="flex flex-wrap justify-center gap-1 min-h-[20px]">
                                  {user.classIds && user.classIds.length > 0 ? (
                                    user.classIds.map(id => (
                                      <Badge key={id} variant="secondary" className="text-[9px] px-1.5 py-0 whitespace-nowrap">
                                        {classes?.find((c: any) => c.id === id)?.name || 'Unknown'}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground italic">Unassigned</span>
                                  )}
                                </div>
                              )}
                              <AssignClassDropdown user={user} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-16 text-center text-muted-foreground">
                          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p>No users found</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
