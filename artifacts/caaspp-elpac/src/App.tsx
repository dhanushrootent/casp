import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

// Pages
import Login from "@/pages/Login";
import StudentDashboard from "@/pages/student/Dashboard";
import AssessmentTake from "@/pages/student/AssessmentTake";
import StudentResults from "@/pages/student/Results";
import TeacherAssessments from "@/pages/teacher/Assessments";
import AssessmentDetail from "@/pages/teacher/AssessmentDetail";
import TeacherStudents from "@/pages/teacher/Students";
import SyllabusUpload from "@/pages/teacher/SyllabusUpload";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminUsers from "@/pages/admin/Users";
import AdminClasses from "@/pages/admin/Classes";

// Auth Hook
import { useAuth } from "@/hooks/use-auth";

const queryClient = new QueryClient();

const ProtectedRoute = ({ component: Component, allowedRoles }: { component: any, allowedRoles: string[] }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

  if (!user) return <Redirect to="/login" />;

  if (!allowedRoles.includes(user.role)) {
    return <Redirect to={`/${user.role}/dashboard`} />;
  }

  return <Component />;
};

function Router() {
  const { user, isLoading } = useAuth();

  return (
    <Switch>
      <Route path="/">
        {() => {
          if (isLoading) return null;
          if (user) return <Redirect to={`/${user.role}/dashboard`} />;
          return <Redirect to="/login" />;
        }}
      </Route>

      <Route path="/login" component={Login} />

      {/* Student Routes */}
      <Route path="/student/dashboard">
        {() => <ProtectedRoute component={StudentDashboard} allowedRoles={['student']} />}
      </Route>
      <Route path="/student/assessment/:id">
        {() => <ProtectedRoute component={AssessmentTake} allowedRoles={['student']} />}
      </Route>
      <Route path="/student/results">
        {() => <ProtectedRoute component={StudentResults} allowedRoles={['student']} />}
      </Route>

      {/* Teacher Routes */}
      <Route path="/teacher/dashboard">
        {() => <ProtectedRoute component={AdminDashboard} allowedRoles={['teacher']} />}
      </Route>
      <Route path="/teacher/assessments">
        {() => <ProtectedRoute component={TeacherAssessments} allowedRoles={['teacher']} />}
      </Route>
      <Route path="/teacher/assessments/:id">
        {() => <ProtectedRoute component={AssessmentDetail} allowedRoles={['teacher']} />}
      </Route>
      <Route path="/teacher/students">
        {() => <ProtectedRoute component={TeacherStudents} allowedRoles={['teacher']} />}
      </Route>
      <Route path="/teacher/syllabus-upload">
        {() => <ProtectedRoute component={SyllabusUpload} allowedRoles={['teacher']} />}
      </Route>

      {/* Admin Routes */}
      <Route path="/admin/dashboard">
        {() => <ProtectedRoute component={AdminDashboard} allowedRoles={['admin']} />}
      </Route>
      <Route path="/admin/users">
        {() => <ProtectedRoute component={AdminUsers} allowedRoles={['admin']} />}
      </Route>
      <Route path="/admin/classes">
        {() => <ProtectedRoute component={AdminClasses} allowedRoles={['admin']} />}
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
