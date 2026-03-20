import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { useListResults } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { CheckCircle, XCircle, Clock, TrendingUp, Loader2, FileText } from 'lucide-react';
import { format } from 'date-fns';

const typeColor: Record<string, string> = {
  CAASPP: 'bg-blue-100 text-blue-700',
  ELPAC: 'bg-teal-100 text-teal-700',
};

export default function StudentResults() {
  const { user } = useAuth();
  const { data: results, isLoading } = useListResults({ studentId: user?.id ?? '' });

  const sortedResults = [...(results ?? [])].sort(
    (a, b) => {
      const dateA = new Date(a.completedAt).getTime();
      const dateB = new Date(b.completedAt).getTime();
      return (isNaN(dateB) ? 0 : dateB) - (isNaN(dateA) ? 0 : dateA);
    }
  );

  const avgScore = sortedResults.length > 0
    ? Math.round(sortedResults.reduce((s, r) => s + r.percentage, 0) / sortedResults.length * 10) / 10
    : 0;
  const passCount = sortedResults.filter(r => r.passed).length;

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">My Results</h1>
          <p className="text-muted-foreground text-lg">Your assessment history and scores</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tests Taken</p>
                    <p className="text-2xl font-bold font-display">{sortedResults.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Average Score</p>
                    <p className="text-2xl font-bold font-display">{avgScore}%</p>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tests Passed</p>
                    <p className="text-2xl font-bold font-display">{passCount}/{sortedResults.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Assessment History</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {sortedResults.map(result => (
                    <div key={result.id} className="flex items-center gap-4 px-6 py-4 hover:bg-muted/20 transition-colors">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${result.passed ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'}`}>
                        {result.passed
                          ? <CheckCircle className="w-5 h-5" />
                          : <XCircle className="w-5 h-5" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-semibold text-foreground truncate">{result.assessmentTitle}</p>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor[result.assessmentType] ?? ''}`}>
                            {result.assessmentType}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {Math.floor((result.timeSpent ?? 0) / 60)}m {(result.timeSpent ?? 0) % 60}s
                          </span>
                          <span>•</span>
                          <span>{result.completedAt ? format(new Date(result.completedAt), 'MMM d, yyyy') : 'N/A'}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-2xl font-bold font-display ${result.passed ? 'text-emerald-600' : 'text-red-500'}`}>
                          {Math.round(result.percentage)}%
                        </p>
                        <p className="text-xs text-muted-foreground">{result.score}/{result.maxScore} pts</p>
                      </div>
                    </div>
                  ))}
                  {sortedResults.length === 0 && (
                    <div className="py-16 text-center text-muted-foreground">
                      <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="font-medium">No results yet</p>
                      <p className="text-sm mt-1">Take an assessment to see your results here</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
