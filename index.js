const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const dotenv = require("dotenv"); // ✅ must install: npm install dotenv
dotenv.config(); // ✅ loads .env file variables into process.env

const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 3000;
const admin = require("firebase-admin");

const serviceAccount = require("./pet-mart-firebase-admin-skd.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// ✅ Use local MongoDB URI from .env file
const uri = process.env.MONGO_URI;

// ✅ Create a MongoClient instance
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyFirebaseToken = async (req, res, next) => {
  const headerToken = req.headers.authorization;

  console.log(headerToken);

  if (!headerToken)
    return error.status(401).status({ message: "unauthorized access" });

  const token = headerToken.split(" ")[1];
  console.log(token);

  try {
    const decode = await admin.auth().verifyIdToken(token);
    req.user = decode;
    console.log(req.user);
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

async function run() {
  try {
    // ✅ Connect to MongoDB
    await client.connect();
    console.log("✅ Connected to MongoDB successfully");
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const database = client.db("petMartDB");
    const usersCollection = database.collection("users");
    const listingsCollection = database.collection("listings");
    const ordersCollection = database.collection("orders");

    app.get("/", (req, res) => {
      res.send("This is from /");
    });

    // 📦 GET all users
    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json({ data: users });
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch users", error });
      }
    });

    // ➕ POST a new user/book
    app.post("/users", async (req, res) => {
      try {
        const newUser = req.body;
        const result = await usersCollection.insertOne(newUser);
        res.json({ data: result });
      } catch (error) {
        res.status(500).json({ message: "Failed to insert user", error });
      }
    });

    app.get("/listings", async (req, res) => {
      try {
        const cursor = listingsCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to get data", error });
      }
    });

    app.get("/listing/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const result = await listingsCollection.findOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.get("/myListings/:email", verifyFirebaseToken, async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const result = await listingsCollection.find({ email: email }).toArray();
      res.send(result);
    });

    app.get("/category-filtered-product/:categoryName", async (req, res) => {
      const queryParams = req.params.categoryName;
      console.log(queryParams);
      if (queryParams == "All") {
        const cursor = listingsCollection.find();
        const result = await cursor.toArray();
        res.send(result);
      } else {
        const cursor = listingsCollection.find({ category: queryParams });
        const result = await cursor.toArray();
        res.send(result);
      }
    });

    app.get("/search", async (req, res) => {
      const search_text = req.query.search;
      const cursor = listingsCollection.find({
        name: { $regex: search_text, $options: "i" },
      });
      const result = await cursor.toArray();
      res.send(result);
    });

    app.post("/listings", verifyFirebaseToken, async (req, res) => {
      try {
        const newListing = req.body;
        const listings = await listingsCollection.insertOne(newListing);
        res.send(listings);
      } catch (error) {
        res.status(500).json({ message: "Failed to insert user", error });
      }
    });

    app.post("/orders", verifyFirebaseToken, async (req, res) => {
      try {
        const newOrder = req.body;
        const result = await ordersCollection.insertOne(newOrder);
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: "Failed Insert Order", error });
      }
    });
  } finally {
    //await client.close()
  }
}

run().catch(console.dir);

// ✅ Start server
app.listen(port, () =>
  console.log(`🚀 Server running on http://localhost:${3000}`)
);
