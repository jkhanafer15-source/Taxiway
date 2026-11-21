# Taxiway — School Transportation Route Optimization System

Taxiway is a full-stack web application designed to simplify and optimize school transportation management. It connects students, drivers, and administrators through a centralized platform that manages transportation requests, driver assignments, GPS locations, and optimized pickup routes.

The goal of Taxiway is to make school transportation more organized, efficient, and easier to manage.

## 🌐 Live Demo

**Explore Taxiway here:**

🔗 **[View My Work — Taxiway Live Website](https://taxiway-nu.vercel.app)**

## 🚀 Key Features

### 👨‍🎓 Student Dashboard
- Student registration and secure login.
- GPS-based house location detection.
- Student profile and school information management.
- Daily school transportation selection.
- Selection of transportation companies and school time schedules.

### 🚗 Driver Dashboard
- Secure driver authentication.
- View students associated with the driver's transportation company.
- Update the driver's current GPS location.
- Calculate driving distances using OpenRouteService.
- Generate an optimized pickup order using a nearest-neighbor routing approach.

### 👨‍💼 Admin Dashboard
- Secure administrator login.
- View registered students and drivers.
- Monitor transportation statistics.
- Register new drivers and assign them to transportation companies.
- Search and manage transportation information.

## 🧠 Route Optimization

Taxiway uses a nearest-neighbor approach to organize student pickups.

The routing process works as follows:

1. Retrieve the driver's current GPS location.
2. Identify students with active transportation requests.
3. Calculate road distances using the OpenRouteService API.
4. Select the nearest student to the driver's current location.
5. Update the starting location to the selected student's location.
6. Repeat the process until all eligible students are included in the pickup sequence.

This approach creates a practical pickup order based on road distances. It is a greedy heuristic rather than a guarantee of the globally shortest route.

## 🛠️ Tech Stack

**Frontend**
- React.js
- JavaScript
- HTML5 and CSS3
- React Router

**Backend**
- Python
- FastAPI
- RESTful APIs
- JWT Authentication

**Database**
- MySQL

**Routing and Location**
- OpenRouteService API
- Browser Geolocation API
- Nearest-Neighbor Routing Algorithm

**Deployment**
- Vercel — Frontend hosting
- Render — Backend API hosting
- Railway — MySQL database hosting
- GitHub — Version control

## 🏗️ System Architecture

```text
               React Frontend
                    |
                  Vercel
                    |
               HTTPS / REST
                    |
              FastAPI Backend
                    |
                   Render
                    |
           -------------------
           |                 |
       MySQL Database    OpenRouteService
           |                 |
        Railway         Road Distances
```

## 🔐 Authentication and Security

Taxiway implements
