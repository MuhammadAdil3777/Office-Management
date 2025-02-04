import React, { useState, useEffect } from 'react';
import { ShieldCheck, LogOut, Clock, Calendar, AlertCircle, Coffee, BarChart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { format, startOfMonth, endOfMonth, isWithinInterval, isWeekend, eachDayOfInterval } from 'date-fns';

interface AttendanceRecord {
  id: string;
  check_in: string;
  check_out: string | null;
  work_mode: 'on_site' | 'remote';
  status: string;
  latitude: number;
  longitude: number;
}

interface BreakRecord {
  start_time: string;
  end_time: string | null;
  status: string | null;
}

interface MonthlyStats {
  totalWorkingDays: number;
  presentDays: number;
  lateDays: number;
  onSiteDays: number;
  remoteDays: number;
  averageWorkHours: number;
  expectedWorkingDays: number;
}

const AdminPage: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState<string>('Employees');
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceRecord[]>([]);
  const [employeeTasks, setEmployeeTasks] = useState<any[]>([]);
  const [todayBreak, setTodayBreak] = useState<BreakRecord[]>([]);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats | null>(null);
  console.log('checking monthly stats', monthlyStats);
  
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (selectedTab === 'Employees') {
      const fetchEmployees = async () => {
        const { data, error } = await supabase
          .from('users')
          .select('id, full_name');
        if (error) {
          console.error('Error fetching employees:', error.message);
        } else {
          setEmployees(data || []);
        }
      };
      fetchEmployees();
    }
  }, [selectedTab]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const calculateDuration = (start: string, end: string | null) => {
    if (!end) {
      end = new Date().toISOString();
    }
    const startTime = new Date(start);
    const endTime = new Date(end);
    const diffInMinutes = Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60));
    const hours = Math.floor(diffInMinutes / 60);
    const minutes = diffInMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  const getTotalBreakDuration = () => {
    let totalMinutes = 0;
    todayBreak.forEach(breakRecord => {
      if (breakRecord.end_time) {
        const start = new Date(breakRecord.start_time);
        const end = new Date(breakRecord.end_time);
        totalMinutes += Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      }
    });
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return totalMinutes > 0 ? `${hours}h ${minutes}m` : null;
  };

  const handleEmployeeClick = async (id: string) => {
    setLoading(true);
    try {
      // Fetch employee details
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();
      if (userError) throw userError;
      setSelectedEmployee(userData);

      // Get today's date range
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
console.log('startOfDay', startOfDay), endOfDay;

      // Fetch today's attendance
      const { data: todayAttendance, error: attendanceError } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', id)
        .gte('check_in', startOfDay.toISOString())
        .lte('check_out', endOfDay.toISOString())
        .order('check_in', { ascending: false })
        .limit(1)
        .single();
        console.log('todayAttendance', todayAttendance);
        

      if (attendanceError && attendanceError.code !== 'PGRST116') throw attendanceError;
      
      if (todayAttendance) {
        setAttendanceLogs([todayAttendance]);
        
        // Fetch break records
        const { data: breakData, error: breakError } = await supabase
          .from('breaks')
          .select('*')
          .eq('attendance_id', todayAttendance.id)
          .order('start_time', { ascending: true });

        if (breakError) throw breakError;
        setTodayBreak(breakData || []);
      }

      // Fetch tasks
   //  const { data: tasksData, error: tasksError } = await supabase
    // .from('tasks')
    //   .select('*')
     //  .eq('user_id', id);

     //if (tasksError) throw tasksError;
    // setEmployeeTasks(tasksData || []);  

      // Calculate monthly statistics
      const monthStart = startOfMonth(today);
      const monthEnd = endOfMonth(today);
      const allDaysInMonth = eachDayOfInterval({ start: monthStart, end: today });
      const workingDaysInMonth = allDaysInMonth.filter(date => !isWeekend(date)).length;

      const { data: monthlyAttendance, error: monthlyError } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('user_id', id)
        .gte('check_in', monthStart.toISOString())
        .lte('check_in', monthEnd.toISOString())
        .order('check_in', { ascending: true });

      if (monthlyError) throw monthlyError;

      if (monthlyAttendance) {
        const attendanceByDate = monthlyAttendance.reduce((acc, curr) => {
          const date = format(new Date(curr.check_in), 'yyyy-MM-dd');
          if (!acc[date] || new Date(curr.check_in) < new Date(acc[date].check_in)) {
            acc[date] = curr;
          }
          return acc;
        }, {} as Record<string, AttendanceRecord>);

        const uniqueAttendance: AttendanceRecord[] = Object.values(attendanceByDate) as AttendanceRecord[];

        let totalHours = 0;
        uniqueAttendance.forEach(attendance => {
          const start = new Date((attendance as AttendanceRecord).check_in);
          const end = (attendance as AttendanceRecord).check_out ? new Date((attendance as AttendanceRecord).check_out as string) : new Date();
          const hours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
          totalHours += Math.min(hours, 24);
        });

        setMonthlyStats({
          expectedWorkingDays: workingDaysInMonth,
          totalWorkingDays: uniqueAttendance.length,
          presentDays: uniqueAttendance.filter((a: AttendanceRecord) => a.status === 'present').length,
          lateDays: (uniqueAttendance as AttendanceRecord[]).filter((a: AttendanceRecord) => a.status === 'late').length,
          onSiteDays: uniqueAttendance.filter(a => a.work_mode === 'on_site').length,
          remoteDays: uniqueAttendance.filter(a => a.work_mode === 'remote').length,
          averageWorkHours: totalHours / uniqueAttendance.length || 0
        });
      }

    } catch (error) {
      console.error('Error fetching employee data:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <div className="bg-white w-64 p-4">
        <div className="mb-4 flex justify-center">
          <ShieldCheck className="w-16 h-16 text-blue-600" />
        </div>
        <div className="space-y-4">
          <button
            onClick={() => setSelectedTab('Employees')}
            className={`w-full text-left p-2 rounded ${
              selectedTab === 'Employees'
                ? 'bg-blue-100 text-blue-600'
                : 'text-gray-700 hover:bg-gray-200'
            }`}
          >
            Employees
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center w-full px-4 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8">
        <h1 className="text-3xl font-bold text-center text-gray-900 mb-4">
          Admin Dashboard
        </h1>

        <div className="grid grid-cols-4 gap-6">
          {/* Employee List */}
          <div className="col-span-1">
            <h2 className="text-xl font-semibold mb-4">Employee List</h2>
            <ul className="space-y-2">
              {employees.map((employee) => (
                <li
                  key={employee.id}
                  onClick={() => handleEmployeeClick(employee.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedEmployee?.id === employee.id
                      ? 'bg-blue-100 text-blue-600'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  {employee.full_name}
                </li>
              ))}
            </ul>
          </div>

          {/* Employee Dashboard */}
          {selectedEmployee && (
            <div className="col-span-3">
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold">
                    {selectedEmployee.full_name}'s Dashboard
                  </h2>
                  <p className="text-gray-600">
                    {format(new Date(), 'EEEE, MMMM d, yyyy')}
                  </p>
                </div>

                {loading ? (
                  <div className="flex items-center justify-center h-64">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <>
                    {/* Today's Status */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="text-lg font-semibold mb-3">Today's Status</h3>
                        {attendanceLogs[0] ? (
                          <div className="space-y-3">
                            <div className="flex justify-between">
                              <span>Check-in:</span>
                              <span>{format(new Date(attendanceLogs[0].check_in), 'h:mm a')}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Check-out:</span>
                              <span>
                                {attendanceLogs[0].check_out
                                  ? format(new Date(attendanceLogs[0].check_out), 'h:mm a')
                                  : 'Not checked out'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Work Mode:</span>
                              <span className={`px-2 py-1 rounded-full text-sm ${
                                attendanceLogs[0].work_mode === 'on_site'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}>
                                {attendanceLogs[0].work_mode}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span>Duration:</span>
                              <span>
                                {calculateDuration(attendanceLogs[0].check_in, attendanceLogs[0].check_out)}
                              </span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500">No attendance record for today</p>
                        )}
                      </div>

                      <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="text-lg font-semibold mb-3">Break Summary</h3>
                        {todayBreak.length > 0 ? (
                          <div className="space-y-3">
                            <div className="flex justify-between">
                              <span>Total Breaks:</span>
                              <span>{todayBreak.length}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Total Break Duration:</span>
                              <span>{getTotalBreakDuration() || '0h 0m'}</span>
                            </div>
                            <div className="space-y-2">
                              {todayBreak.map((breakRecord, index) => (
                                <div key={index} className="text-sm">
                                  Break {index + 1}: {format(new Date(breakRecord.start_time), 'h:mm a')}
                                  {breakRecord.end_time && (
                                    <> - {format(new Date(breakRecord.end_time), 'h:mm a')}</>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-500">No breaks recorded today</p>
                        )}
                      </div>
                    </div>

                    {/* Monthly Overview */}
                    {monthlyStats && (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="text-lg font-semibold mb-3">Monthly Overview</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <h4 className="font-medium mb-2">Attendance</h4>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span>Expected Days:</span>
                                <span>{monthlyStats.expectedWorkingDays}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Present Days:</span>
                                <span className="text-green-600">{monthlyStats.presentDays}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Late Days:</span>
                                <span className="text-yellow-600">{monthlyStats.lateDays}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Work Mode</h4>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span>On-site:</span>
                                <span>{monthlyStats.onSiteDays}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Remote:</span>
                                <span>{monthlyStats.remoteDays}</span>
                              </div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Work Hours</h4>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span>Average Daily:</span>
                                <span>{monthlyStats.averageWorkHours.toFixed(1)}h</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Total Hours:</span>
                                <span>
                                  {(monthlyStats.averageWorkHours * monthlyStats.totalWorkingDays).toFixed(1)}h
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tasks */}
                    <div className="mt-6">

                       {/* Monthly Overview Card */}
        <div className="lg:col-span-3 bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center mb-6">
            <BarChart className="w-6 h-6 text-blue-600 mr-2" />
            <h2 className="text-xl font-semibold">Monthly Overview - {format(new Date(), 'MMMM yyyy')}</h2>
          </div>

          {monthlyStats ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Attendance Summary</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Expected Working Days:</span>
                    <span className="font-medium">{monthlyStats.expectedWorkingDays}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Days Attended:</span>
                    <span className="font-medium">{monthlyStats.totalWorkingDays}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Present Days:</span>
                    <span className="font-medium text-green-600">{monthlyStats.presentDays}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Late Days:</span>
                    <span className="font-medium text-yellow-600">{monthlyStats.lateDays}</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Work Mode Distribution</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">On-site Days:</span>
                    <span className="font-medium text-blue-600">{monthlyStats.onSiteDays}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Remote Days:</span>
                    <span className="font-medium text-purple-600">{monthlyStats.remoteDays}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Attendance Rate:</span>
                    <span className="font-medium">
                      {((monthlyStats.totalWorkingDays / monthlyStats.expectedWorkingDays) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Work Hours</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Average Daily Hours:</span>
                    <span className="font-medium">
                      {monthlyStats.averageWorkHours.toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Total Hours:</span>
                    <span className="font-medium">
                      {(monthlyStats.averageWorkHours * monthlyStats.totalWorkingDays).toFixed(1)}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Expected Hours:</span>
                    <span className="font-medium">
                      {(8 * monthlyStats.expectedWorkingDays)}h
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No attendance records found for this month
            </div>
          )}
        </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
export default AdminPage;
