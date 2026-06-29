# FRONTEND INTEGRATION GUIDE

## REGISTRATION FLOW (STEP BY STEP)

### Step 1: User Enters Email
```javascript
const handleEmailBlur = async (email) => {
  const response = await fetch('/api/auth/check-admin-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  
  const data = await response.json();
  setIsAdminEmail(data.isAdmin);
  // If data.isAdmin is true, enable admin role option
  // Otherwise, disable admin role option
};
```

### Step 2: Show Role Dropdown
```javascript
const roleOptions = [
  { value: 'donor', label: 'Blood Donor' },
  { value: 'receiver', label: 'Blood Receiver' },
  { value: 'hospital', label: 'Hospital' }
];

// If isAdminEmail is true, add admin option
if (isAdminEmail) {
  roleOptions.push({ value: 'admin', label: 'Admin' });
}
```

### Step 3: Register with Role
```javascript
const handleRegister = async () => {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fullName,
      username,
      email,
      password,
      role // Selected from dropdown
    })
  });
  
  const data = await response.json();
  if (data.success) {
    // Store user info
    localStorage.setItem('user', JSON.stringify(data.user));
    // Redirect to login
    navigate('/login');
  }
};
```

---

## LOGIN FLOW & REDIRECT LOGIC

### After Successful Login
```javascript
const handleLogin = async () => {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    credentials: 'include' // Include cookies
  });
  
  const data = await response.json();
  if (data.success) {
    const { profileCompleted, role, hospitalVerified } = data.user;
    
    // REDIRECT LOGIC:
    if (!profileCompleted) {
      // User hasn't filled basic profile yet
      navigate('/update-profile');
    } else if (role === 'hospital' && !hospitalVerified) {
      // Hospital registered but not verified
      navigate('/hospital-verification-pending');
    } else {
      // All good, go to homepage
      navigate('/home');
    }
  }
};
```

---

## PROFILE UPDATE FLOW

### For Receiver/Donor
```javascript
const handleProfileUpdate = async () => {
  const response = await fetch('/api/user/update-profile', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      phoneNumber,
      bloodGroup,
      age,
      weight,
      diseases: ['diabetes', 'none'], // array
      location: {
        city: 'Mumbai',
        state: 'Maharashtra',
        coordinates: { lat, lng }
      }
      // NOTE: Do NOT include role here
    }),
    credentials: 'include'
  });
  
  const data = await response.json();
  if (data.success) {
    navigate('/home');
  }
};
```

### For Hospital Verification
```javascript
const handleHospitalVerification = async () => {
  const response = await fetch('/api/hospital/request-verification', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      hospitalName: 'Apollo Hospital',
      registrationNumber: 'REG123456',
      hospitalAddress: '123 Hospital Lane, Mumbai',
      hospitalPhone: '+919876543210'
    }),
    credentials: 'include'
  });
  
  const data = await response.json();
  if (data.success) {
    // Show "Verification pending" message
    setVerificationStatus('pending');
  }
};
```

---

## HOMEPAGE LOGIC BY ROLE

### Donor/Receiver Homepage
```javascript
const HomeContent = () => {
  const user = JSON.parse(localStorage.getItem('user'));
  
  if (user.role === 'donor') {
    return (
      <Layout>
        <NavMenu items={['Home', 'View Requests', 'My Acceptances', 'Profile', 'Notifications']} />
        <MainContent>
          {/* Show view requests and accept button */}
          {/* Show my acceptances list */}
        </MainContent>
      </Layout>
    );
  }
  
  if (user.role === 'receiver') {
    return (
      <Layout>
        <NavMenu items={['Home', 'Create Request', 'My Requests', 'Profile', 'Notifications']} />
        <MainContent>
          {/* Create request form */}
          {/* My requests list */}
        </MainContent>
      </Layout>
    );
  }
};
```

### Hospital Homepage (Unverified)
```javascript
const HospitalHome = () => {
  const user = JSON.parse(localStorage.getItem('user'));
  
  if (user.role === 'hospital' && !user.hospitalVerified) {
    return (
      <Layout>
        <Alert type="warning">
          Hospital verification pending. Admin will review your request.
        </Alert>
        <NavMenu items={['Home', 'My Donations', 'Profile', 'Notifications']} />
        {/* No "Create Request" or "Select Donor" options */}
      </Layout>
    );
  }
};
```

### Hospital Homepage (Verified)
```javascript
const VerifiedHospitalHome = () => {
  const user = JSON.parse(localStorage.getItem('user'));
  
  if (user.role === 'hospital' && user.hospitalVerified) {
    return (
      <Layout>
        <NavMenu items={[
          'Home',
          'View Requests',
          'Select Donor',
          'My Donations',
          'Profile',
          'Notifications'
        ]} />
        <MainContent>
          {/* Can view requests and select donors */}
        </MainContent>
      </Layout>
    );
  }
};
```

### Admin Dashboard
```javascript
const AdminDashboard = () => {
  return (
    <Layout>
      <NavMenu items={[
        'Dashboard',
        'Verify Hospitals',
        'View Users',
        'Notifications'
      ]} />
      <MainContent>
        {/* Hospital verification requests */}
        {/* User management */}
      </MainContent>
    </Layout>
  );
};
```

---

## RECEIVER CREATES REQUEST FLOW

```javascript
const CreateRequestForm = () => {
  const [formData, setFormData] = useState({
    bloodGroup: '',
    quantity: '',
    emergencyLevel: 'medium',
    location: '',
    hospitalName: '',
    description: ''
  });
  
  const handleSubmit = async () => {
    const response = await fetch('/api/requests/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify(formData),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      toast.success('Request created! Donors can now accept.');
      navigate('/my-requests');
    }
  };
};
```

---

## DONOR ACCEPTS REQUEST FLOW

```javascript
const RequestCard = ({ request }) => {
  const handleAccept = async () => {
    const response = await fetch(`/api/requests/${request._id}/accept`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      toast.success('Request accepted! Hospital will review.');
      setRequest({ ...request, status: 'accepted' });
    }
  };
  
  return (
    <Card>
      <h3>{request.bloodGroup} ({request.quantity} units)</h3>
      <p>Emergency: {request.emergencyLevel}</p>
      <p>Status: {request.status}</p>
      <button onClick={handleAccept}>Accept Request</button>
    </Card>
  );
};
```

---

## HOSPITAL SELECTS DONOR FLOW

### Step 1: View Requests
```javascript
const HospitalViewRequests = () => {
  const [requests, setRequests] = useState([]);
  
  useEffect(() => {
    fetchRequests();
  }, []);
  
  const fetchRequests = async () => {
    const response = await fetch('/api/hospital/requests', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      credentials: 'include'
    });
    const data = await response.json();
    setRequests(data.requests);
  };
  
  return (
    <div>
      {requests.map(req => (
        <RequestCard key={req._id} request={req}>
          <button onClick={() => navigate(`/hospital/select-donor/${req._id}`)}>
            Select Donor
          </button>
        </RequestCard>
      ))}
    </div>
  );
};
```

### Step 2: See Accepted Donors
```javascript
const HospitalSelectDonor = ({ requestId }) => {
  const [donors, setDonors] = useState([]);
  const [selected, setSelected] = useState(null);
  const [rejected, setRejected] = useState([]);
  
  useEffect(() => {
    fetchDonors();
  }, []);
  
  const fetchDonors = async () => {
    const response = await fetch(`/api/requests/${requestId}/detail`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      credentials: 'include'
    });
    const data = await response.json();
    setDonors(data.data.acceptedDonors);
  };
  
  return (
    <div>
      {donors.map(donor => (
        <DonorCard key={donor.donorId} donor={donor.donorDetails}>
          <label>
            <input 
              type="radio"
              checked={selected === donor.donorId}
              onChange={() => setSelected(donor.donorId)}
            />
            Select this donor
          </label>
          <label>
            <input 
              type="checkbox"
              checked={rejected.includes(donor.donorId)}
              onChange={(e) => {
                if (e.target.checked) {
                  setRejected([...rejected, donor.donorId]);
                } else {
                  setRejected(rejected.filter(id => id !== donor.donorId));
                }
              }}
            />
            Reject this donor
          </label>
        </DonorCard>
      ))}
    </div>
  );
};
```

### Step 3: Submit Selection
```javascript
const handleSelectDonor = async () => {
  const response = await fetch(`/api/requests/${requestId}/hospital-select-donor`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      selectedDonorId: selected,
      rejectedDonorIds: rejected,
      hospitalVerificationNotes: 'All medical tests passed'
    }),
    credentials: 'include'
  });
  
  const data = await response.json();
  if (data.success) {
    toast.success('Donor selected! Donation process started.');
    navigate('/hospital/donations');
  }
};
```

---

## DONATION FLOW (Donor Side)

### Step 1: Initiate Donation
```javascript
const DonorInitiateDonation = ({ donation }) => {
  const handleInitiate = async () => {
    const response = await fetch(`/api/donations/${donation._id}/initiate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        donorNotes: 'Feeling good and ready'
      }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      toast.success('Donation initiated!');
      setDonation({ ...donation, status: 'initiated' });
    }
  };
};
```

### Step 2: Complete Donation
```javascript
const DonorCompleteDonation = ({ donation }) => {
  const handleComplete = async () => {
    const response = await fetch(`/api/donations/${donation._id}/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      },
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      toast.success('Donation completed! Hospital will verify.');
      setDonation({ ...donation, status: 'completed' });
    }
  };
};
```

---

## HOSPITAL VERIFIES DONATION

```javascript
const HospitalVerifyDonation = ({ donation }) => {
  const [notes, setNotes] = useState('');
  
  const handleApprove = async () => {
    const response = await fetch(`/api/donations/${donation._id}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        isVerified: true,
        verificationNotes: notes
      }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      toast.success('Donation verified!');
      // Receiver will get success notification
    }
  };
  
  const handleReject = async () => {
    const response = await fetch(`/api/donations/${donation._id}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        isVerified: false,
        verificationNotes: notes
      }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      toast.info('Donation rejected. Request will go back for new donor selection.');
    }
  };
};
```

---

## NOTIFICATIONS HANDLING

### Fetch Notifications
```javascript
const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  
  useEffect(() => {
    fetchNotifications();
    fetchUnreadCount();
    
    // Refresh every 10 seconds
    const interval = setInterval(() => {
      fetchNotifications();
      fetchUnreadCount();
    }, 10000);
    
    return () => clearInterval(interval);
  }, []);
  
  const fetchNotifications = async () => {
    const response = await fetch('/api/notifications/view', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      credentials: 'include'
    });
    const data = await response.json();
    setNotifications(data.notifications);
  };
  
  const fetchUnreadCount = async () => {
    const response = await fetch('/api/notifications/unread-count', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      credentials: 'include'
    });
    const data = await response.json();
    setUnreadCount(data.unreadCount);
  };
  
  const markAsRead = async (notificationId) => {
    await fetch(`/api/notifications/${notificationId}/read`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${accessToken}` },
      credentials: 'include'
    });
    fetchNotifications();
    fetchUnreadCount();
  };
  
  return { notifications, unreadCount, markAsRead };
};
```

### Display Notifications
```javascript
const NotificationBell = () => {
  const { notifications, unreadCount, markAsRead } = useNotifications();
  
  return (
    <div>
      <Bell>
        {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
      </Bell>
      <Dropdown>
        {notifications.map(notif => (
          <NotificationItem key={notif.id}>
            <p>{notif.message}</p>
            {notif.status === 'sent' && (
              <button onClick={() => markAsRead(notif.id)}>Mark as read</button>
            )}
          </NotificationItem>
        ))}
      </Dropdown>
    </div>
  );
};
```

---

## ERROR HANDLING TEMPLATE

```javascript
const handleApiCall = async (url, options = {}) => {
  try {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        ...options.headers
      },
      credentials: 'include',
      ...options
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      // Handle specific status codes
      if (response.status === 401) {
        // Token expired, refresh or redirect to login
        localStorage.removeItem('user');
        navigate('/login');
      } else if (response.status === 403) {
        toast.error(data.message || 'Access denied');
      } else {
        toast.error(data.message || 'An error occurred');
      }
      return null;
    }
    
    return data;
  } catch (error) {
    toast.error('Network error. Please try again.');
    return null;
  }
};
```

---

## KEY FRONTEND STORAGE

```javascript
// Store in localStorage after login
localStorage.setItem('user', JSON.stringify({
  id: user.id,
  fullName: user.fullName,
  email: user.email,
  role: user.role,
  profileCompleted: user.profileCompleted,
  hospitalVerified: user.hospitalVerified
}));

// Store access token (optional if using cookies)
localStorage.setItem('accessToken', accessToken);
```

---

## ADMIN VERIFICATION WORKFLOW

```javascript
const AdminVerifyHospitals = () => {
  const [hospitals, setHospitals] = useState([]);
  
  useEffect(() => {
    fetchPendingHospitals();
  }, []);
  
  const fetchPendingHospitals = async () => {
    const response = await fetch('/api/admin/hospital-verification-requests', {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      credentials: 'include'
    });
    const data = await response.json();
    setHospitals(data.data);
  };
  
  const handleApprove = async (hospitalId) => {
    const response = await fetch('/api/admin/verify-hospital', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        hospitalId,
        isApproved: true,
        rejectionNotes: ''
      }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      toast.success('Hospital verified!');
      fetchPendingHospitals();
    }
  };
  
  const handleReject = async (hospitalId, reason) => {
    const response = await fetch('/api/admin/verify-hospital', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        hospitalId,
        isApproved: false,
        rejectionNotes: reason
      }),
      credentials: 'include'
    });
    
    const data = await response.json();
    if (data.success) {
      toast.info('Hospital rejected.');
      fetchPendingHospitals();
    }
  };
};
```