Project: Blood Bank Donation System

Tech Stack:

* Node.js
* Express.js
* MongoDB
* JWT Authentication

Completed:
✓ Register
✓ Login
✓ Logout
✓ Refresh Token
✓ Profile Update
✓ Profile Completion Check

✓ Create Blood Request
✓ View Blood Requests
✓ My Requests
✓ Accept Request

✓ Donation Record Creation
✓ Donation Verification

✓ Notification System

Collections:

* User
* BloodRequest
* DonationRecord
* Notification

Current Route Structure:
POST /auth/register
POST /auth/login
POST /auth/logout
POST /auth/refresh-tokens

PUT /profile/update
GET /profile/details

POST /requests/create
GET /requests/view
GET /requests/my-requests
POST /requests/accept/:id

POST /donations/verify/:id

GET /notifications/view

Current Goal:
Continue development from Phase-2.
Need Admin Verification, Document Upload, Broadcast Notifications, Hospital Features.
