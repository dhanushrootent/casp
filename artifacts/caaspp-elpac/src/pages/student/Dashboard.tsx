import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, Button, Badge } from '@/components/ui';
import { PlayCircle, Clock, BookOpen } from 'lucide-react';
import { Link } from 'wouter';

// Mock assessments since we don't have a populated DB
const MOCK_ASSESSMENTS = [
  { id: 'a1', title: 'Grade 8 ELA Practice Test', type: 'CAASPP', subject: 'English Language Arts', duration: 45, questionCount: 20, status: 'active' },
  { id: 'a2', title: 'Summative ELPAC - Listening', type: 'ELPAC', subject: 'Listening', duration: 30, questionCount: 15, status: 'active' },
  { id: 'a3', title: 'Grade 8 Math Performance Task', type: 'CAASPP', subject: 'Mathematics', duration: 60, questionCount: 10, status: 'active' },
];

export default function StudentDashboard() {
  return (
    <DashboardLayout>
      <div className="space-y-8">
        <section>
          <h1 className="text-3xl font-display font-bold mb-2">Welcome back, Alex!</h1>
          <p className="text-muted-foreground text-lg">You have 3 assessments waiting for you.</p>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-gradient-to-br from-primary to-primary/90 text-primary-foreground border-0 shadow-lg shadow-primary/20">
            <CardContent className="p-6">
              <BookOpen className="w-8 h-8 mb-4 opacity-80" />
              <p className="text-4xl font-bold font-display mb-1">3</p>
              <p className="text-primary-foreground/80 font-medium">Pending Assessments</p>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-6">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-4xl font-bold font-display mb-1 text-foreground">12</p>
              <p className="text-muted-foreground font-medium">Completed This Year</p>
            </CardContent>
          </Card>
          <Card className="bg-white">
            <CardContent className="p-6">
              <div className="w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center mb-4">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
              </div>
              <p className="text-4xl font-bold font-display mb-1 text-foreground">85%</p>
              <p className="text-muted-foreground font-medium">Average Score</p>
            </CardContent>
          </Card>
        </div>

        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-display font-bold">Assigned Assessments</h2>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {MOCK_ASSESSMENTS.map((assessment) => (
              <Card key={assessment.id} className="flex flex-col hover:border-primary/50 hover:shadow-lg transition-all duration-300">
                <CardHeader className="pb-4">
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant={assessment.type === 'CAASPP' ? 'default' : 'secondary'}>
                      {assessment.type}
                    </Badge>
                    <Badge variant="outline">{assessment.subject}</Badge>
                  </div>
                  <CardTitle className="text-xl leading-tight">{assessment.title}</CardTitle>
                </CardHeader>
                <CardContent className="pb-6 flex-1">
                  <div className="flex items-center text-sm text-muted-foreground gap-4">
                    <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" /> {assessment.duration} mins</span>
                    <span className="flex items-center gap-1.5"><BookOpen className="w-4 h-4" /> {assessment.questionCount} Questions</span>
                  </div>
                </CardContent>
                <div className="p-6 pt-0 mt-auto">
                  <Link href={`/student/assessment/${assessment.id}`} className="block">
                    <Button className="w-full group" variant="default">
                      Start Assessment
                      <PlayCircle className="w-4 h-4 ml-2 group-hover:scale-110 transition-transform" />
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
