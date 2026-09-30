import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { profileRouter } from "./routes/profile";
import { planRouter } from "./routes/plan";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: "https://react-gym-app-beta.vercel.app",
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

//API routes
app.use("/api/profile", profileRouter);
app.use("/api/plan", planRouter);



app.listen(PORT, ()=>{
    console.log(`Server running on port: ${PORT}`);
})


