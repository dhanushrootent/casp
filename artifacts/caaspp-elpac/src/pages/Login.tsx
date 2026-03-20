import React, { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { Input, Button, Card, CardContent } from '@/components/ui';
import { GraduationCap, BookOpen, KeyRound } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, isLoading } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login({ username, password });
      window.location.href = `/${user.role}/dashboard`;
    } catch (err) {
      setError('Invalid credentials. Please try the demo accounts.');
    }
  };

  const prefill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-0 right-0 w-1/2 h-full bg-primary/5 rounded-bl-[100px] -z-10" />
      <div className="absolute -bottom-32 -left-32 w-96 h-96 bg-accent/10 rounded-full blur-3xl -z-10" />
      
      <div className="w-full max-w-5xl mx-auto px-4 grid md:grid-cols-2 gap-12 items-center">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="hidden md:block"
        >
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-white mb-8 shadow-xl shadow-primary/20">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h1 className="text-5xl font-display font-bold text-foreground leading-tight mb-6">
            Welcome to the <br/>
            <span className="text-primary">CAASPP & ELPAC</span><br/>
            Assessment Platform
          </h1>
          <p className="text-lg text-muted-foreground mb-8 max-w-md">
            A comprehensive solution for California public schools to track student progress, administer tests, and generate AI-powered syllabi.
          </p>
          <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border">
              <BookOpen className="w-4 h-4 text-accent" /> AI Generation
            </div>
            <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border">
              <BarChart3 className="w-4 h-4 text-primary" /> Real-time Analytics
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="w-full max-w-md mx-auto shadow-2xl shadow-black/5 border-0">
            <CardContent className="p-8">
              <div className="md:hidden flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center text-white">
                  <GraduationCap className="w-6 h-6" />
                </div>
                <h2 className="font-display font-bold text-xl text-primary">CAASPP & ELPAC</h2>
              </div>

              <h2 className="text-2xl font-display font-bold mb-2">Sign In</h2>
              <p className="text-muted-foreground mb-8">Enter your credentials to access your portal.</p>
              
              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">Username</label>
                  <Input 
                    placeholder="Enter username" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    className="bg-gray-50/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2 text-foreground">Password</label>
                  <Input 
                    type="password" 
                    placeholder="••••••••" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="bg-gray-50/50"
                  />
                </div>
                
                {error && <p className="text-destructive text-sm font-medium">{error}</p>}
                
                <Button type="submit" className="w-full h-12 text-lg mt-2" isLoading={isLoading}>
                  Sign In
                </Button>
              </form>

              <div className="mt-10 pt-8 border-t">
                <p className="text-sm font-semibold text-muted-foreground mb-4 flex items-center gap-2">
                  <KeyRound className="w-4 h-4" /> Demo Accounts
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Button variant="outline" size="sm" onClick={() => prefill('student1', 'demo123')} className="justify-start">
                    Student
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => prefill('teacher1', 'demo123')} className="justify-start">
                    Teacher
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => prefill('admin1', 'demo123')} className="justify-start">
                    Admin
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

// Need to import BarChart3 for the hero section
import { BarChart3 } from 'lucide-react';
