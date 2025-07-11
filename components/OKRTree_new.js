import { useState, useEffect, useCallback } from 'react';
import ReactFlow, { Background, Controls, useNodesState, useEdgesState } from 'reactflow';
import 'reactflow/dist/style.css';
import OKRNode from './tree/OKRNode';
import AddOKRForm from './forms/AddOKRForm';
import AddTaskForm from './forms/AddTaskForm';
import api from '../lib/api';

// Register custom node types
const nodeTypes = {
  okrNode: OKRNode,
};

// Enhanced tree layout algorithm that prevents node collisions
const buildTreeStructure = (okrsList, users = [], currentUser = null, teamMembers = [], filterOptions = {}) => {
  if (!okrsList || okrsList.length === 0) {
    return { nodes: [], edges: [] };
  }

  // Create lookup maps
  const okrMap = {};
  okrsList.forEach(okr => {
    okrMap[okr.okr_id] = okr;
  });
  
  // Create parent-child relationships map
  const childrenMap = {};
  okrsList.forEach(okr => {
    if (okr.parent_okr) {
      if (!childrenMap[okr.parent_okr]) {
        childrenMap[okr.parent_okr] = [];
      }
      childrenMap[okr.parent_okr].push(okr.okr_id);
    }
  });

  // Find root OKRs (those without a parent_okr)
  const rootOKRs = okrsList.filter(okr => !okr.parent_okr);
  
  // Node dimensions and spacing
  const nodeWidth = 280;
  const nodeHeight = 130;
  const verticalSpacing = 180; // Space between hierarchy levels
  const horizontalGap = 40;   // Minimum horizontal gap between siblings
    // Build nodes array
  const nodes = [];
  const edges = [];
  
  // Track node IDs to create proper edges
  const nodeIdMap = {}; // Maps okr_id to node id in the graph
  let nodeId = 1;
  
  // First pass: Calculate subtree widths for optimal node positioning
  const getSubtreeWidth = (okrId) => {
    const children = childrenMap[okrId] || [];
    
    if (children.length === 0) {
      // Leaf node, return its width
      return nodeWidth;
    }
    
    // Calculate sum of all children widths with gaps between them
    let childrenTotalWidth = 0;
    for (const childId of children) {
      childrenTotalWidth += getSubtreeWidth(childId);
      // Add horizontal gap between siblings (except after the last child)
      if (childId !== children[children.length - 1]) {
        childrenTotalWidth += horizontalGap;
      }
    }
    
    // Return the maximum of this node's width and its children's total width
    return Math.max(nodeWidth, childrenTotalWidth);
  };
  
  // Second pass: Position nodes using the calculated subtree widths
  const positionNodesInSubtree = (okrId, level, startX, parentX = null) => {
    const children = childrenMap[okrId] || [];
    const subtreeWidth = getSubtreeWidth(okrId);
    
    // Calculate node center X position
    const nodeX = startX + (subtreeWidth / 2) - (nodeWidth / 2);
    const nodeY = level * verticalSpacing;
      // Create node
    const currentNodeId = `${nodeId}`;
    const okr = okrMap[okrId];
      // Check if current user is assigned to this OKR
    let isAssignedToCurrentUser = false;
    if (currentUser && currentUser.teams_id && okr.assigned_users_details) {
      isAssignedToCurrentUser = okr.assigned_users_details.some(
        user => user.user_id === currentUser.teams_id
      );
      console.log(`OKR ${okr.okr_id} - ${okr.name} - Is assigned to current user: ${isAssignedToCurrentUser}`);
    }
    
    // Check if the OKR matches any filter criteria
    let matchesBusinessUnitFilter = false;
    let matchesAssignedToFilter = false;
    
    // Business unit filter
    if (filterOptions.businessUnit && okr.business_units && okr.business_units.length > 0) {
      matchesBusinessUnitFilter = okr.business_units.some(
        bu => bu.id === filterOptions.businessUnit || bu.business_unit_id === filterOptions.businessUnit
      );
    }
    
    // Assigned To filter
    if (filterOptions.assignedTo && okr.assigned_users_details && okr.assigned_users_details.length > 0) {
      matchesAssignedToFilter = okr.assigned_users_details.some(
        user => user.user_id === filterOptions.assignedTo
      );
    }
      
    nodes.push({
      id: currentNodeId,
      type: 'okrNode',
      position: { x: nodeX, y: nodeY },      
      data: {
        ...okr,
        level,
        isLeafNode: children.length === 0,
        users, // Pass users to each node
        currentUser, // Pass current user to each node
        teamMembers, // Pass team members to each node
        isAssignedToCurrentUser, // Flag to indicate if current user is assigned
        matchesBusinessUnitFilter, // Flag for business unit filter
        matchesAssignedToFilter, // Flag for assigned to filter
      }
    });
    
    nodeIdMap[okrId] = currentNodeId;
    nodeId++;
    
    // Create edge from parent to this node if this isn't a root node
    if (parentX !== null) {
      edges.push({
        id: `e${parentX}-${currentNodeId}`,
        source: parentX,
        target: currentNodeId,
        type: 'smoothstep',
        style: { stroke: '#888', strokeWidth: 2 },
        animated: false,
        markerEnd: {
          type: 'arrowclosed',
          color: '#888',
          width: 20,
          height: 20
        }
      });
    }
    
    // Position children
    if (children.length > 0) {
      let childStartX = startX;
      
      for (const childId of children) {
        const childWidth = getSubtreeWidth(childId);
        positionNodesInSubtree(childId, level + 1, childStartX, currentNodeId);
        childStartX += childWidth + horizontalGap;
      }
    }
  };
  
  // Calculate total width needed by all root OKRs with spacing
  let totalRootsWidth = 0;
  rootOKRs.forEach(root => {
    totalRootsWidth += getSubtreeWidth(root.okr_id);
    totalRootsWidth += horizontalGap; // Add gap between root nodes
  });
  totalRootsWidth -= horizontalGap; // Remove extra gap after last root
  
  // Position all root nodes and their subtrees
  let startX = 50; // Starting X position with some padding
  
  rootOKRs.forEach(root => {
    const rootSubtreeWidth = getSubtreeWidth(root.okr_id);
    positionNodesInSubtree(root.okr_id, 0, startX);
    startX += rootSubtreeWidth + horizontalGap;
  });
  
  return { nodes, edges };
};

// Main OKR Tree Component
function OKRTree({ teamId, departmentId, statusFilter }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [allOkrs, setAllOkrs] = useState([]);
  const [rootOkrs, setRootOkrs] = useState([]);
  const [okrsList, setOkrsList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddOKRForm, setShowAddOKRForm] = useState(false);
  const [showAddTaskForm, setShowAddTaskForm] = useState(false);
  const [formType, setFormType] = useState('root');
  const [selectedOKR, setSelectedOKR] = useState(null);
  const [selectedRootOkr, setSelectedRootOkr] = useState('all');
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [businessUnits, setBusinessUnits] = useState([]);
  const [dataLoading, setDataLoading] = useState({
    users: true,
    departments: true,
    businessUnits: true
  });
  const [filter, setFilter] = useState({
    team: teamId,
    department: departmentId,
    status: statusFilter
  });
  const [currentUser, setCurrentUser] = useState(null);
  const [teamMembers, setTeamMembers] = useState([]);
  
  // Filter state for business units and assigned users
  const [selectedBusinessUnit, setSelectedBusinessUnit] = useState('');
  const [selectedAssignedTo, setSelectedAssignedTo] = useState('');
  const [areFiltersApplied, setAreFiltersApplied] = useState(false);
  const [filterOptions, setFilterOptions] = useState({
    businessUnit: null,
    assignedTo: null
  });
  
  // Search functionality for Assigned To dropdown
  const [assignedToSearch, setAssignedToSearch] = useState('');
  const [filteredUsers, setFilteredUsers] = useState([]);
  
  // Fetch users, departments, and business units once when component mounts
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Get current user from localStorage
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const userData = JSON.parse(userStr);
          setCurrentUser(userData);
          
          // Fetch team members
          try {
            const teamMembersData = await api.getTeamMembers();
            setTeamMembers(teamMembersData.teams || []);
          } catch (teamErr) {
            console.error('Error fetching team members:', teamErr);
          }
        }
      
        console.log('Fetching users data...');
        const usersData = await api.getUsers();
        console.log('Users data loaded successfully');
        setUsers(usersData);
        setFilteredUsers(usersData); // Initialize filtered users with all users
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setDataLoading(prev => ({ ...prev, users: false }));
      }

      try {
        console.log('Fetching departments data...');
        const departmentsData = await api.getDepartments();
        console.log('Departments data loaded successfully');
        setDepartments(departmentsData);
      } catch (error) {
        console.error('Error fetching departments:', error);
      } finally {
        setDataLoading(prev => ({ ...prev, departments: false }));
      }

      try {
        console.log('Fetching business units data...');
        const businessUnitsData = await api.getBusinessUnits();
        console.log('Business units data loaded successfully');
        setBusinessUnits(businessUnitsData);
      } catch (error) {
        console.error('Error fetching business units:', error);
      } finally {
        setDataLoading(prev => ({ ...prev, businessUnits: false }));
      }
    };

    fetchInitialData();
  }, []);

  // Fetch OKRs from API
  useEffect(() => {
    const fetchOKRs = async () => {
      setIsLoading(true);
      try {
        let apiFunction = api.getOKRs;
        let params = {};
        
        // Apply filters if provided
        if (filter.team) {
          params.team_id = filter.team;
        }
        if (filter.department) {
          params.department_id = filter.department;
        }
        if (filter.status && filter.status !== 'All') {
          params.status = filter.status;
        }
        
        const data = await apiFunction(params);
        setAllOkrs(data);
        
        // Extract root OKRs for the dropdown
        const roots = data.filter(okr => !okr.parent_okr);
        setRootOkrs(roots);
        
        // Initially set all OKRs
        setOkrsList(data);
        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching OKRs:', error);
        setIsLoading(false);
      }
    };
    
    fetchOKRs();
  }, [filter]);
  
  // Filter OKRs by selected root OKR
  useEffect(() => {
    if (!allOkrs.length) return;
    
    if (selectedRootOkr === 'all') {
      setOkrsList(allOkrs);
      return;
    }
    
    // Helper function to recursively find all child OKRs
    const getAllChildrenOf = (okrId, okrsList) => {
      const children = okrsList.filter(okr => okr.parent_okr === okrId);
      let allChildren = [...children];
      
      children.forEach(child => {
        const grandchildren = getAllChildrenOf(child.okr_id, okrsList);
        allChildren = [...allChildren, ...grandchildren];
      });
      
      return allChildren;
    };
    
    // Find the selected root OKR
    const rootOkr = allOkrs.find(okr => okr.okr_id.toString() === selectedRootOkr);
    if (!rootOkr) return;
    
    // Get all children of the selected root OKR
    const children = getAllChildrenOf(rootOkr.okr_id, allOkrs);
    
    // Set the filtered OKRs list (root + all its children)
    setOkrsList([rootOkr, ...children]);
  }, [selectedRootOkr, allOkrs]);
  
  // Handle refresh after continuing iteration
  const handleContinueIteration = useCallback(async (newOKR) => {
    // Refresh the OKRs list to include the new iteration
    try {
      let apiFunction = api.getOKRs;
      let params = {};
      
      // Apply filters if provided
      if (filter.team) {
        params.team_id = filter.team;
      }
      if (filter.department) {
        params.department_id = filter.department;
      }
      if (filter.status && filter.status !== 'All') {
        params.status = filter.status;
      }
      
      const data = await apiFunction(params);
      setAllOkrs(data);
      
      // Extract root OKRs for the dropdown
      const roots = data.filter(okr => !okr.parent_okr);
      setRootOkrs(roots);
      
      // Set all OKRs
      setOkrsList(data);
    } catch (error) {
      console.error('Error refreshing OKRs after iteration:', error);
    }
  }, [filter]);

  // Update nodes with the onContinueIteration callback
  useEffect(() => {    
    if (okrsList.length > 0) {
      const { nodes: treeNodes, edges: treeEdges } = buildTreeStructure(okrsList, users, currentUser, teamMembers, filterOptions);
      
      // Add the onContinueIteration callback to each node
      const nodesWithCallback = treeNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          onContinueIteration: handleContinueIteration
        }
      }));
      
      setNodes(nodesWithCallback);
      setEdges(treeEdges);
    }
  }, [okrsList, setNodes, setEdges, handleContinueIteration, filterOptions]);
  
  // Filter users based on search input
  useEffect(() => {
    if (users && users.length > 0) {
      if (!assignedToSearch.trim()) {
        setFilteredUsers(users);
        return;
      }
      
      const query = assignedToSearch.toLowerCase();
      const filtered = users.filter(user => 
        (user.user_name && user.user_name.toLowerCase().includes(query)) ||
        (user.teams_user_principal_name && user.teams_user_principal_name.toLowerCase().includes(query))
      );
      setFilteredUsers(filtered);
    }
  }, [assignedToSearch, users]);
  
  // Handle node click - expand node and highlight connected nodes
  const onNodeClick = useCallback((event, node) => {
    // Update the selected OKR with the clicked node's data
    setSelectedOKR(node.data);
    console.log('Node clicked:', node);
  }, []);
  
  // Handle filter application
  const applyFilters = () => {
    setFilterOptions({
      businessUnit: selectedBusinessUnit ? selectedBusinessUnit : null,
      assignedTo: selectedAssignedTo ? selectedAssignedTo : null
    });
    setAreFiltersApplied(true);
  };
  
  // Reset all filters
  const resetFilters = () => {
    setSelectedBusinessUnit('');
    setSelectedAssignedTo('');
    setFilterOptions({
      businessUnit: null,
      assignedTo: null
    });
    setAreFiltersApplied(false);
    setAssignedToSearch('');
  };

  // Handle form submit for new OKR
  const handleAddOKR = async (formData) => {
    try {
      // If we're adding a sub-objective, make sure the parent_okr is set
      if (formType === 'sub' && selectedOKR) {
        console.log('Adding sub-objective with parent:', selectedOKR.okr_id);
        // Use parent_okr instead of parent_okr_id to match the Django model field name
        formData.parent_okr = selectedOKR.okr_id;
      }
      
      console.log('Creating OKR with data:', formData);
      const newOKR = await api.createOKR(formData);
      setAllOkrs(prev => [...prev, newOKR]);
      
      // Update root OKRs list if the new OKR is a root
      if (!newOKR.parent_okr) {
        setRootOkrs(prev => [...prev, newOKR]);
      }
      
      alert('OKR created successfully!');
      setShowAddOKRForm(false);
    } catch (error) {
      console.error('Error creating OKR:', error);
      alert('Failed to create OKR. Please try again.');
    }
  };
  
  // Handle form submit for new Task
  const handleAddTask = async (formData) => {
    try {
      // Set the linked_to_okr_id to the selected OKR's ID
      if (selectedOKR) {
        formData.linked_to_okr = selectedOKR.okr_id;
        console.log('OKRTree - Setting linked_to_okr to selected OKR:', selectedOKR.okr_id);
      }
      
      console.log('OKRTree - Creating task with data:', formData);
      console.log('OKRTree - Available users being passed to form:', users);
      
      const newTask = await api.createTask(formData);
      console.log('OKRTree - Task created successfully:', newTask);
      
      alert('Task created successfully!');
      setShowAddTaskForm(false);
    } catch (error) {
      console.error('Error creating task:', error);
      alert('Failed to create task. Please try again.');
    }
  };
  
  return (
    <div className="okr-tree-container h-screen">
      <div className="flex flex-col sm:flex-row justify-between mb-4 p-2 bg-gray-100 rounded">
        <div className="flex items-center space-x-4 mb-2 sm:mb-0">
          {/* <h2 className="text-lg font-semibold">OKR Alignment</h2> */}
          <div className="relative w-full sm:w-auto">
            <select
              className="block appearance-none w-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-2 pr-8 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
              value={selectedRootOkr}
              onChange={(e) => setSelectedRootOkr(e.target.value)}
            >
              <option value="all">All Objectives</option>
              {rootOkrs.map(okr => (
                <option key={okr.okr_id} value={okr.okr_id.toString()}>
                  {okr.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">          
          <button
            className="flex-grow sm:flex-grow-0 px-3 py-1 bg-[#F6490D] text-white rounded hover:bg-[#E03D00]"
            onClick={() => {
              setFormType('root');
              setShowAddOKRForm(true);
            }}
          >
            <span className="hidden sm:inline">Add Root Objective</span>
            <span className="sm:hidden">Add Root</span>
          </button>
          
          {selectedOKR && (
            <>          
              <button
                className="flex-grow sm:flex-grow-0 px-3 py-1 bg-[#F6490D] text-white rounded hover:bg-[#E03D00]"
                onClick={() => {
                  setFormType('sub');
                  setShowAddOKRForm(true);
                }}
              >
                <span className="hidden sm:inline">Add Sub Objective</span>
                <span className="sm:hidden">Add Sub</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* New Filter Row */}
      <div className="flex flex-col sm:flex-row justify-between mb-4 p-2 bg-gray-100 rounded">
        <div className="flex flex-wrap items-center gap-3 w-full">
          {/* Business Unit Filter */}
          <div className="relative w-full sm:w-auto flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Business Unit</label>
            <select
              className="block appearance-none w-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-2 pr-8 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
              value={selectedBusinessUnit}
              onChange={(e) => setSelectedBusinessUnit(e.target.value)}
            >
              <option value="">All Business Units</option>
              {businessUnits && businessUnits.map(bu => (
                <option key={bu.id || bu.business_unit_id} value={bu.id || bu.business_unit_id}>
                  {bu.name || bu.business_unit_name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700" style={{ top: '22px' }}>
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
              </svg>
            </div>
            {areFiltersApplied && filterOptions.businessUnit && (
              <div className="mt-1 text-xs">
                <span className="inline-block w-3 h-3 mr-1" style={{ backgroundColor: '#8fadd9', borderRadius: '50%' }}></span>
              </div>
            )}
          </div>
          
          {/* Assigned To Filter */}
          <div className="relative w-full sm:w-auto flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
            <div className="relative">
              <input
                type="text"
                className="block w-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-2 rounded shadow leading-tight focus:outline-none focus:shadow-outline mb-1"
                placeholder="Search users..."
                value={assignedToSearch}
                onChange={(e) => setAssignedToSearch(e.target.value)}
              />
              <select
                className="block appearance-none w-full bg-white border border-gray-300 hover:border-gray-400 px-4 py-2 pr-8 rounded shadow leading-tight focus:outline-none focus:shadow-outline"
                value={selectedAssignedTo}
                onChange={(e) => setSelectedAssignedTo(e.target.value)}
              >
                <option value="">All Users</option>
                {filteredUsers.map(user => (
                  <option key={user.teams_id} value={user.teams_id}>
                    {user.user_name || user.teams_user_principal_name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute bottom-0 right-0 flex items-center px-2 h-10 text-gray-700">
                <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/>
                </svg>
              </div>
            </div>
            {areFiltersApplied && filterOptions.assignedTo && (
              <div className="mt-1 text-xs">
                <span className="inline-block w-3 h-3 mr-1" style={{ backgroundColor: '#d179ba', borderRadius: '50%' }}></span>
              </div>
            )}
          </div>
          
          {/* Filter Buttons */}
          <div className="w-full sm:w-auto flex items-end space-x-2">
            <button 
              className="flex-grow sm:flex-grow-0 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              onClick={applyFilters}
            >
              Filter
            </button>
            <button 
              className="flex-grow sm:flex-grow-0 px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
              onClick={resetFilters}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
        
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <p className="text-lg text-gray-500">Loading OKRs...</p>
        </div>
      ) : (
        <div className="h-[80vh] border border-solid border-gray-300 rounded">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            attributionPosition="bottom-right"
            defaultViewport={{ x: 0, y: 0, zoom: 0.65 }}
            zoomOnScroll={true}
            panOnDrag={true}
            zoomOnDoubleClick={true}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      )}
        
      {/* Add OKR Form Modal */}
      {showAddOKRForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg sm:text-xl font-semibold">
                {formType === 'root' 
                  ? 'Add Root Objective' 
                  : `Add Sub-Objective for: ${selectedOKR?.name || 'Selected OKR'}`
                }
              </h3>
              <button 
                onClick={() => setShowAddOKRForm(false)} 
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <AddOKRForm 
              onSubmit={handleAddOKR}
              onCancel={() => setShowAddOKRForm(false)}
              parentOkrId={formType === 'sub' ? selectedOKR?.okr_id : null}
              users={users}
              departments={departments}
              isLoading={dataLoading.users || dataLoading.departments}
            />
          </div>
        </div>
      )}
      
      {/* Add Task Form Modal */}
      {showAddTaskForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-4 sm:p-6 rounded-lg w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg sm:text-xl font-semibold">
                {selectedOKR 
                  ? `Add Task for: ${selectedOKR.name}`
                  : 'Add Task'
                }
              </h3>
              <button 
                onClick={() => setShowAddTaskForm(false)} 
                className="text-gray-500 hover:text-gray-700"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <AddTaskForm 
              okrId={selectedOKR?.okr_id}
              users={users}
              okrs={okrsList}
              onSubmit={handleAddTask}
              onCancel={() => {
                setShowAddTaskForm(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default OKRTree;
