# miniTorque E-Commerce Platform

A full-featured e-commerce web application built with **Node.js, Express.js, MongoDB, and EJS**, featuring secure authentication, advanced order management, and integrated payments.

---

## Features

### User Features
- **Authentication:** Email/password, OTP verification, optional Google OAuth  
- **User profile:** Address management, order history, wallet  
- **Product browsing:** Search, filters, wishlist, detailed product pages  
- **Shopping cart:** Quantity updates, real-time price calculation  
- **Checkout:** COD, Razorpay (online), wallet payments  
- **Extras:** Coupons, offers, referral rewards, returns & refunds, email notifications  

### Admin Features
- **Admin panel:** Secure login and protected routes  
- **Product/category/banner management:** Full CRUD with image uploads  
- **Order management:** Status updates, cancellations, returns handling  
- **Coupon & offer management:** Configure referrals, wallet adjustments  
- **Dashboard:** Sales, orders, best-selling products/categories  
- **Reports:** Sales reports with date filters, export to PDF/Excel  

---

## Tech Stack

- **Backend:** Node.js, Express.js  
- **Database:** MongoDB with Mongoose  
- **Templating:** EJS  
- **Authentication:** Sessions (express-session), OTP, Google OAuth  
- **Payments:** Razorpay (online), Cash on Delivery  
- **Email:** Nodemailer  
- **File Uploads:** Multer  
- **Security:** bcrypt, input validation, basic CSRF/XSS protection  

---

## Prerequisites

- Node.js (latest LTS recommended)  
- MongoDB (local or MongoDB Atlas)  
- npm or yarn  
- Razorpay account (for payment integration)  
- Email account/app password (for Nodemailer)  

---

## Installation

### Clone the repository

```bash
git clone <your-repo-url>
cd miniTorque
```

### Install dependencies

```bash
npm install
```

### Create a .env file

Create a `.env` file in the project root with the following variables:

```env
PORT=3000
NODE_ENV=development
MONGO_URI=your_mongodb_connection_string
SESSION_SECRET=your-super-secret-session-key
NODEMAILER_EMAIL=your_email@gmail.com
NODEMAILER_PASSWORD=your_app_password
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=https://your-domain.com/auth/google/callback
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
```

### Start the application

**Development:**

```bash
npm run dev
```

**Production:**

```bash
npm start
```

### Access the application

- **User:** http://localhost:3000
- **Admin:** http://localhost:3000/admin

---

## Project Structure

```
miniTorque/
├── config/        # Configuration (DB, multer, passport, etc.)
├── controllers/   # Route controllers (admin, user)
├── middleware/    # Custom middlewares (auth, validation, etc.)
├── models/        # Mongoose models
├── public/        # Static files (CSS, JS, images)
├── routes/        # Route definitions (admin, user)
├── utils/         # Helper utilities
├── validator/     # Validation logic
├── views/         # EJS templates (admin, user, partials)
├── app.js         # Main server file
└── package.json   # Scripts and dependencies
```

---

## Security

- Passwords hashed with bcrypt
- Session-based authentication with secure cookies
- Input validation and sanitization for forms
- Role-based access control for admin routes

---

## Contributing

1. Fork the repository
2. Create a branch: `git checkout -b feature/YourFeature`
3. Commit changes: `git commit -m "Add YourFeature"`
4. Push branch: `git push origin feature/YourFeature`
5. Open a Pull Request

---

## Author

**Anaswar P K** – [GitHub Profile](https://github.com/Anaswar4)

---

## License

This project is open source and available under the [MIT License](LICENSE).