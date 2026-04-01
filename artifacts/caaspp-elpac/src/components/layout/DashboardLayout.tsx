import React, { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Link, useLocation } from 'wouter';
import { 
  BookOpen, 
  GraduationCap, 
  LayoutDashboard, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  FileText,
  Users,
  BarChart3,
  CheckCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../ui';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { user, logout } = useAuth();
  const [location] = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  if (!user) return null;

  const roleNavItems = {
    student: [
      { name: 'Dashboard', path: '/student/dashboard', icon: LayoutDashboard },
      { name: 'My Results', path: '/student/results', icon: CheckCircle },
    ],
    teacher: [
      { name: 'Overview', path: '/teacher/dashboard', icon: LayoutDashboard },
      { name: 'Syllabus AI', path: '/teacher/syllabus-upload', icon: FileText },
      { name: 'Assessments', path: '/teacher/assessments', icon: BookOpen },
      { name: 'My Students', path: '/teacher/students', icon: Users },
    ],
    admin: [
      { name: 'Analytics', path: '/admin/dashboard', icon: BarChart3 },
      { name: 'Users', path: '/admin/users', icon: Users },
      { name: 'Classes', path: '/admin/classes', icon: GraduationCap },
    ]
  };

  const navItems = roleNavItems[user.role as keyof typeof roleNavItems] || [];

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={closeMobileMenu}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-screen w-72 flex-col bg-white border-r border-border shadow-xl shadow-black/5 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:shadow-none",
        isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-20 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 text-white">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display font-bold text-xl text-primary leading-tight">CAASPP<span className="text-accent">&</span>ELPAC</h1>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Assessment Platform</p>
            </div>
          </div>
          <button onClick={closeMobileMenu} className="ml-auto lg:hidden text-muted-foreground hover:text-foreground">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-6 px-4 space-y-1.5">
          {navItems.map((item) => {
            const isActive = location === item.path || location.startsWith(item.path + '/');
            return (
              <Link 
                key={item.name} 
                href={item.path}
                onClick={closeMobileMenu}
                className={cn(
                  "flex items-center gap-3 px-4 py-3.5 rounded-xl font-medium transition-all duration-200 group",
                  isActive 
                    ? "bg-primary/10 text-primary" 
                    : "text-muted-foreground hover:bg-gray-100 hover:text-foreground"
                )}
              >
                <item.icon className={cn(
                  "w-5 h-5 transition-transform duration-200", 
                  isActive ? "scale-110" : "group-hover:scale-110"
                )} />
                {item.name}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto border-t border-border p-4">
          <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 mb-4">
            <div className="font-semibold text-sm text-foreground">{user.name}</div>
            <div className="text-xs text-muted-foreground capitalize">{user.role}</div>
          </div>
          <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex min-h-screen min-w-0 flex-1 flex-col lg:ml-72">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-border sticky top-0 z-30 flex items-center justify-between px-4 sm:px-8">
          <button onClick={toggleMobileMenu} className="lg:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground">
            <Menu className="w-6 h-6" />
          </button>
          <div className="hidden sm:block">
            <h2 className="text-xl font-display font-semibold text-foreground capitalize">
              {location.split('/')[1]} Portal
            </h2>
          </div>
          <div className="flex items-center gap-4 ml-auto">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shadow-sm border border-primary/20">
                {user.name.charAt(0)}
              </div>
            </div>
          </div>
        </header>
        
        <div className="flex-1 p-4 sm:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
