import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from '@/components/ui';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useListClasses, useCreateClass, useListUsers, useUpdateUser, getListClassesQueryKey, getListUsersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, Users, BookOpen, Loader2, Plus, CheckSquare } from 'lucide-react';

function AssignStudentsDialog({ cls }: { cls: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  
  const { data: users, isLoading } = useListUsers({ role: 'student' });
  const updateUserMutation = useUpdateUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const gradeStudents = (users ?? []).filter(u => String(u.grade) === String(cls.grade));

  // Pre-populate selections when dialog opens
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setSelectedUserIds(new Set(gradeStudents.filter(u => u.classIds?.includes(cls.id)).map(u => u.id)));
    }
  };

  const toggleStudent = (userId: string) => {
    const newSet = new Set(selectedUserIds);
    if (newSet.has(userId)) newSet.delete(userId);
    else newSet.add(userId);
    setSelectedUserIds(newSet);
  };

  const handleSave = async () => {
    try {
      const updatePromises = gradeStudents.map(student => {
        const isCurrentlyInClass = student.classIds?.includes(cls.id);
        const shouldBeInClass = selectedUserIds.has(student.id);
        
        if (!isCurrentlyInClass && shouldBeInClass) {
          const newClassIds = [...(student.classIds || []), cls.id];
          return updateUserMutation.mutateAsync({ userId: student.id, data: { classIds: newClassIds } });
        } else if (isCurrentlyInClass && !shouldBeInClass) {
          const newClassIds = (student.classIds || []).filter(id => id !== cls.id);
          return updateUserMutation.mutateAsync({ userId: student.id, data: { classIds: newClassIds } });
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);
      toast({ title: 'Students assigned successfully!' });
      setIsOpen(false);
      queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error assigning students', description: String(error) });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full mt-4">
          <CheckSquare className="w-4 h-4 mr-2" /> Assign Students
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Assign Students to {cls.name}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto py-4">
          {isLoading ? (
            <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          ) : gradeStudents.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">No students found in Grade {cls.grade}</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-4">Select the Grade {cls.grade} students you wish to enroll in this class.</p>
              {gradeStudents.map(student => (
                <div key={student.id} className="flex items-center space-x-3 p-2 hover:bg-muted/50 rounded-lg cursor-pointer" onClick={() => toggleStudent(student.id)}>
                  <input
                    type="checkbox"
                    checked={selectedUserIds.has(student.id)}
                    onChange={() => {}} // dummy onChange to suppress React warning, handled by parent onClick
                    className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">{student.name}</p>
                    <p className="text-xs text-muted-foreground">{student.email}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <Button onClick={handleSave} disabled={updateUserMutation.isPending} className="w-full mt-2">
          {updateUserMutation.isPending ? 'Saving...' : 'Save Assignments'}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminClasses() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    grade: '',
    section: '',
    teacherId: ''
  });

  const { data: classes, isLoading } = useListClasses();
  // Fetch teachers for the assign teacher dropdown
  const { data: teachers, isLoading: isLoadingTeachers } = useListUsers({ role: 'teacher' });
  const createClassMutation = useCreateClass();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.teacherId) {
      toast({ variant: 'destructive', title: 'Teacher Required', description: 'Please select a teacher from the dropdown.' });
      return;
    }
    try {
      await createClassMutation.mutateAsync({ data: formData });
      toast({ title: 'Class created successfully!' });
      setIsDialogOpen(false);
      setFormData({ name: '', grade: '', section: '', teacherId: '' });
      queryClient.invalidateQueries({ queryKey: getListClassesQueryKey() });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Error creating class', description: String(error) });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold mb-2">Class Management</h1>
            <p className="text-muted-foreground text-lg">All registered classes and their teachers</p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="w-4 h-4 mr-2" /> Create Class</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Class</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateClass} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Class Name</Label>
                  <Input id="name" placeholder="e.g. English 101" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="grade">Grade Level</Label>
                    <select
                      id="grade"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                      required
                      value={formData.grade}
                      onChange={e => setFormData({ ...formData, grade: e.target.value })}
                    >
                      <option value="" disabled>Select Grade</option>
                      {[3,4,5,6,7,8,11].map(g => (
                        <option key={g} value={String(g)}>Grade {g}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="section">Section (Optional)</Label>
                    <Input id="section" placeholder="e.g. A, B, Morning" value={formData.section} onChange={e => setFormData({ ...formData, section: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="teacherId">Assign Teacher</Label>
                    <select
                      id="teacherId"
                      className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                      required
                      value={formData.teacherId}
                      onChange={e => setFormData({ ...formData, teacherId: e.target.value })}
                    >
                      <option value="" disabled>{isLoadingTeachers ? 'Loading...' : 'Select Teacher'}</option>
                      {teachers?.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createClassMutation.isPending || isLoadingTeachers}>
                  {createClassMutation.isPending ? 'Creating...' : 'Create Class'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                <GraduationCap className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Classes</p>
                <p className="text-2xl font-bold font-display">{classes?.length ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Enrolled Students</p>
                <p className="text-2xl font-bold font-display">
                  {classes?.reduce((s, c) => s + c.studentCount, 0) ?? 0}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Teachers</p>
                <p className="text-2xl font-bold font-display">
                  {new Set(classes?.map(c => c.teacherId) ?? []).size}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(classes ?? []).map(cls => (
              <Card key={cls.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                      <GraduationCap className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-foreground truncate">{cls.name}</h3>
                      <p className="text-sm text-muted-foreground">Grade {cls.grade}{(cls as any).section ? ` • Section ${(cls as any).section}` : ''}</p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                      Active
                    </span>
                  </div>

                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <BookOpen className="w-3.5 h-3.5" />
                        Teacher
                      </span>
                      <span className="font-medium text-foreground">{cls.teacherName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Students Enrolled
                      </span>
                      <span className="font-bold text-foreground">{cls.studentCount}</span>
                    </div>
                  </div>
                  
                  <AssignStudentsDialog cls={cls} />
                </CardContent>
              </Card>
            ))}
            {(classes?.length ?? 0) === 0 && (
              <div className="col-span-3 py-16 text-center text-muted-foreground">
                <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No classes found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
