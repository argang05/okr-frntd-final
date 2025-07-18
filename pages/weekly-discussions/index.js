﻿import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getMyWeeklyForms } from '../../lib/weeklyDiscussions'; 
import Header from '../../components/Header';

export default function WeeklyDiscussions() {
  const [forms, setForms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All'); // Add filter state
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [isClient, setIsClient] = useState(false);
  
  // Check authentication on load
  // useEffect(() => {
  //   let token;
  //   if (typeof window !== 'undefined') {
  //     token = localStorage?.getItem('accessToken') || localStorage?.getItem('auth_token');
  //   }   
  //   setIsAuthenticated(!!token);
  //   if (!token) {
  //     setError('You must be logged in to view weekly discussions.');
  //     setLoading(false);
  //   }
  // }, []);  
  
  // useEffect(() => {
  //   const fetchForms = async () => {
  //     if (!isAuthenticated) return;
  //     try {
  //       setLoading(true);
  //       console.log("Fetching weekly forms...");
  //       const formsData = await getMyWeeklyForms();
  //       console.log("Retrieved forms data:", formsData);
  //       setForms(formsData);
  //     } catch (err) {
  //       console.error("Error details:", {
  //         message: err.message,
  //         response: err.response?.data,
  //         status: err.response?.status
  //       });
  //       if (err.response?.status === 401) {
  //         setError('Authentication error. Please login again.');
  //       } else {
  //         setError('Failed to load weekly discussions. Please try again later.');
  //       }
  //     } finally {
  //       setLoading(false);
  //     }
  //   };
  //   fetchForms();
  // }, [isAuthenticated]);
  
  useEffect(() => {
  if (typeof window !== 'undefined') {
    setIsClient(true);

    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
    }
  }
}, []);

useEffect(() => {
  let token;
  if (typeof window !== 'undefined') {
    token = localStorage?.getItem('accessToken') || localStorage?.getItem('auth_token');
  }
  setIsAuthenticated(!!token);
  if (!token) {
    setError('You must be logged in to view weekly discussions.');
    setLoading(false);
  }
}, []);

useEffect(() => {
  const fetchForms = async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      console.log("Fetching weekly forms...");
      const formsData = await getMyWeeklyForms();
      console.log("Retrieved forms data:", formsData);
      setForms(formsData);
    } catch (err) {
      console.error("Error details:", {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status
      });
      if (err.response?.status === 401) {
        setError('Authentication error. Please login again.');
      } else {
        setError('Failed to load weekly discussions. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };
  fetchForms();
}, [isAuthenticated]);

  
  // Filter forms based on active filter
  const getFilteredForms = () => {
    if (!forms || forms.length === 0) return [];
    
    switch (activeFilter) {
      case 'Pending':
        // Return forms that haven't been filled (status = 0 or 1) and are not future weeks
        return forms.filter(form => 
          (form.status === 0 || form.status === 1) && !form.is_future
        );
      case 'Yet to Start':
        // Return forms for the next 3 upcoming weeks
        return forms.filter(form => form.is_future).slice(0, 3);
      case 'Completed':
        // Return forms that have been submitted (status = 2)
        return forms.filter(form => form.status === 2);
      case 'All':
      default:
        // Return all forms
        return forms;
    }
  };
  
  const getStatusClass = (status) => {
    switch (status) {
      case 0: // Not Started
        return 'bg-gray-100 text-gray-800';
      case 1: // In Progress
        return 'bg-yellow-100 text-yellow-800';
      case 2: // Submitted
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };
    const getButtonText = (form) => {
    // If form is submitted but can be edited
    if (form.status === 2 && form.can_edit) return (
      <>
        <span className="hidden sm:inline">View/Edit Submission</span>
        <span className="sm:hidden">View/Edit</span>
      </>
    );
    // If form is submitted and cannot be edited
    if (form.status === 2) return (
      <>
        <span className="hidden sm:inline">View Submission</span>
        <span className="sm:hidden">View</span>
      </>
    );
    // If form is for a future week
    if (form.is_future) return (
      <>
        <span className="hidden sm:inline">Week Not Started Yet</span>
        <span className="sm:hidden">Not Started</span>
      </>
    );
    // If form is for past week
    if (isPastWeek(form.entry_date)) return (
      <>
        <span className="hidden sm:inline">Complete Form</span>
        <span className="sm:hidden">Complete</span>
      </>
    );
    // Current week, not submitted
    return (
      <>
        <span className="hidden sm:inline">Start Form</span>
        <span className="sm:hidden">Start</span>
      </>
    );
  };
  
  const isCurrentWeek = (dateStr) => {
    const formDate = new Date(dateStr);
    const today = new Date();
    // Get the Monday of the current week
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));  
    currentMonday.setHours(0, 0, 0, 0);
    // Get the Sunday of the current week
    const currentSunday = new Date(currentMonday);
    currentSunday.setDate(currentMonday.getDate() + 6);
    return formDate >= currentMonday && formDate <= currentSunday;
  };
  
  const isPastWeek = (dateStr) => {
    const formDate = new Date(dateStr);
    const today = new Date();
    // Get the Monday of the current week
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));  
    currentMonday.setHours(0, 0, 0, 0);
    return formDate < currentMonday;
  };
  
  return (
    <div>
      <Head>
        <title>O3 WEEKLY DISCUSSION | OKR Tracker</title>
      </Head>
      {/* <Header
        isAuthenticated={isAuthenticated}
        user={JSON.parse(localStorage?.getItem('user') || '{}')}
        hideTeamDiscussions={true}
      /> */}
      {isClient && (
          <Header
            isAuthenticated={isAuthenticated}
            user={user}
            hideTeamDiscussions={true}
          />
        )}
      <div className="container mx-auto px-4 py-4 sm:py-8 content-with-fixed-header">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl sm:text-3xl font-bold">O3 WEEKLY DISCUSSION</h1>
          
        </div>

        {/* Filter buttons */}
        {!loading && !error && forms.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6">
            {['All', 'Pending', 'Yet to Start', 'Completed'].map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`px-4 py-2 rounded-md text-sm sm:text-base ${
                  activeFilter === filter
                    ? 'bg-[#F6490D] text-white'
                    : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-40 sm:h-64">
            <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>        ) : error ? (
          <div className="bg-red-100 border border-red-400 text-red-700 px-3 sm:px-4 py-3 rounded mb-4">  
            <p className="text-sm sm:text-base">{error}</p>
            {!isAuthenticated && (
              <div className="mt-4">
                <Link href="/test-auth">
                  <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm sm:text-base">
                    Login
                  </button>
                </Link>
              </div>
            )}          </div>        ) : (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-3 sm:p-6">
              {getFilteredForms().length === 0 ? (
                <div className="py-8 text-center text-gray-500">
                  <p>No forms found for this filter.</p>
                </div>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {getFilteredForms().map((form) => (
                    <li key={form.form_id} className="py-4">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex flex-col">
                          <div className="py-1">
                            <span className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium ${isCurrentWeek(form.entry_date) ? 'bg-blue-100 text-blue-800' : ''}`}>
                              <span className="text-base">{form.week}</span>
                              {isCurrentWeek(form.entry_date) && <span className="ml-2 font-bold">(Current Week)</span>}
                            </span>
                          </div>
                          <span className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusClass(form.status)}`}>
                            {form.status_display}
                          </span>
                      </div>
                      <Link href={`/weekly-discussions/${form.form_id}`} className="w-full sm:w-auto">
                        <button
                          className={`w-full sm:w-auto min-w-[140px] text-center px-4 py-2 rounded-md ${
                            form.is_future 
                              ? 'bg-gray-400 text-white cursor-not-allowed'
                              : form.status === 2 && form.can_edit
                                ? 'bg-[#F6490D] hover:bg-opacity-90 text-white'
                                : isPastWeek(form.entry_date) 
                                  ? 'bg-[#111111] hover:bg-opacity-90 text-white'
                                  : 'bg-blue-600 hover:bg-blue-700 text-white'
                          }`}
                          disabled={form.is_future}
                        >
                          {getButtonText(form)}
                        </button>
                      </Link>
                    </div>
                  </li>                ))}
              </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
