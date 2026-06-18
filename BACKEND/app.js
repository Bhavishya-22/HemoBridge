//external imports
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config({
    path: './.env', 
});

//internal imports
const connectDB = require('./src/utils/databaseUtil');//1
const PORT = process.env.PORT || 3000;
const userRouter = require('./src/routes/userRouter');

//code
const rootDir = path.resolve();
const app = express();


//middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(rootDir, 'public')));
app.use(cookieParser());//this enables cookies any where in the code by req.cookies()

//routes
app.use('/', userRouter);

//mongodb connection and server start
connectDB().then(() => {
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });
}).catch((error) => {
    console.error("Failed to connect to the database. Server not started.", error);
});