# Demoportfolio
Mobile Web app powered by termux 

---

📊 UserFlow – User Management Dashboard

UserFlow is a simple web application that lets you manage a list of users. You can add, view, edit, and delete user profiles. It's a clean, responsive dashboard built as a portfolio project to demonstrate full‑stack development skills.

https://demoportfolio-2.onrender.com (replace with your own screenshot later)

---

✨ Features

· View all users – See a list of everyone in the system, with their name, email, and a unique ID.
· Add new users – Fill in a name and email, then click "Add User" to create a new profile.
· Edit users – Click the "Edit" button next to any user to update their name or email.
· Delete users – Remove a user from the system with the "Delete" button (with a confirmation prompt).
· Live stats – The dashboard shows the total number of users and the name of the most recently added user.
· Health monitoring – A status indicator at the top shows whether the API and database are connected.

---

🛠️ Technologies Used

Layer Technology
Frontend HTML, CSS, JavaScript (vanilla)
Backend Node.js + Express
Database Mysql 
Hosting Render (free tier)

---

🚀 Live Demo

The application is live at:
👉 https://demoportfolio-2.onrender.com

---

📁 Project Structure

```
.
├── public/
│   └── index.html          # Main dashboard (HTML + CSS + JS)
├── server.js               # Express server with API routes
├── package.json            # Dependencies and scripts
└── README.md               # This file
```

---

🔧 Setup Instructions (for developers)

1. Clone the repository

```bash
git clone https://github.com/yourusername/your-repo-name.git
cd your-repo-name
```

2. Install dependencies

```bash
npm install
```

3. Set up environment variables

Create a .env file in the root directory and add your database connection string:

```
DATABASE_URL=postgresql://username:password@host:port/database
```

4. Run the server locally

```bash
npm start
```

The app will be available at http://localhost:3000.

---

📡 API Endpoints

Method Endpoint Description
GET /api/users Get all users
POST /api/users Create a new user (name + email)
PUT /api/users/:id Update an existing user
DELETE /api/users/:id Delete a user
GET /health Check API and database status

---

🤝 Contributing

This is a personal portfolio project, but suggestions and improvements are welcome! Feel free to open an issue or submit a pull request.

---

📄 License

This project is open source and available under the MIT License.

---

Happy managing! 👨‍💻👩‍💻
