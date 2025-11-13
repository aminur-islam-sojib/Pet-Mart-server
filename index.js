// ✅ Imports
const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Remove dotenv.config() (Vercel injects env vars automatically)

// ---- Guarded Firebase Admin setup ----
let adminInitialized = false;
if (process.env.FB_SERVICE_KEY) {
  try {
    const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
      "utf8"
    );
    const serviceAccount = JSON.parse(decoded);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    adminInitialized = true;
    console.log("Firebase admin initialized");
  } catch (err) {
    console.error("Failed to initialize Firebase admin:", err.message);
    // don't throw — keep server running and return 503 for protected routes
  }
} else {
  console.warn(
    "FB_SERVICE_KEY env var not provided — Firebase admin not initialized"
  );
}

// ✅ MongoDB Setup
const uri = process.env.MONGO_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ✅ Middleware to verify Firebase token
const verifyFirebaseToken = async (req, res, next) => {
  if (!adminInitialized) {
    return res
      .status(503)
      .json({ message: "Authentication service not initialized" });
  }

  const headerToken = req.headers.authorization;
  if (!headerToken)
    return res.status(401).json({ message: "Unauthorized access" });

  const token = headerToken.split(" ")[1];
  try {
    const decode = await admin.auth().verifyIdToken(token);
    req.user = decode;
    next();
  } catch (error) {
    return res.status(403).json({ message: "Invalid or expired token" });
  }
};

app.get("/", (req, res) => res.send("Paw Mart backend — OK"));

// ✅ Main async function
async function run() {
  try {
    if (!uri) {
      console.warn(
        "MONGO_URI not provided — skipping DB connection. Database routes may fail at runtime."
      );
    } else {
      // await client.connect();
      console.log("Connected to MongoDB");
    }
    const database = client.db("petMartDB");
    const usersCollection = database.collection("users");
    const listingsCollection = database.collection("listings");
    const ordersCollection = database.collection("orders");
    const subscriptionCollection = database.collection("subscription");

    // ✅ All routes below
    app.get("/", (req, res) =>
      res.send("✅ Paw Mart backend running on Vercel")
    );

    app.get("/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.json({ data: users });
      } catch (error) {
        res.status(500).json({ message: "Failed to fetch users", error });
      }
    });

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
        const result = await listingsCollection.find().toArray();
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

    app.get("/recent-products", async (req, res) => {
      try {
        const result = await listingsCollection
          .find()
          .sort({ _id: -1 })
          .limit(6)
          .toArray();
        res.send(result);
      } catch (error) {
        res
          .status(500)
          .json({ message: "Failed to fetch recent products", error });
      }
    });

    app.get("/myListings/:email", verifyFirebaseToken, async (req, res) => {
      const token_email = req.user.email;
      const email = req.params.email;
      if (token_email !== email)
        return res.status(403).send({ message: "Forbidden Access" });
      const result = await listingsCollection.find({ email }).toArray();
      res.send(result);
    });

    app.delete("/myListings/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const result = await listingsCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    app.get("/category-filtered-product/:categoryName", async (req, res) => {
      const queryParams = req.params.categoryName;
      const cursor =
        queryParams === "all"
          ? listingsCollection.find()
          : listingsCollection.find({ categorySlug: queryParams });
      const result = await cursor.toArray();
      res.send(result);
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

    app.post("/subscription", async (req, res) => {
      try {
        const newEmail = req.body;
        const result = await subscriptionCollection.insertOne(newEmail);
        res.send(result);
      } catch (error) {
        res.status(500).json({ message: "Failed to insert user", error });
      }
    });

    app.get("/myOrders/:email", verifyFirebaseToken, async (req, res) => {
      const token_email = req.user.email;
      const email = req.params.email;
      if (token_email !== email)
        return res.status(401).send({ message: "Forbidden Access" });
      const cursor = ordersCollection.find({ buyerEmail: email });
      const result = await cursor.toArray();
      res.send(result);
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

    app.patch("/updateItem/:id", verifyFirebaseToken, async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;
      const result = await listingsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedData }
      );
      res.send(result);
    });
  } catch (err) {
    console.error("❌ Server error:", err.message);
  }
}

run().catch(console.dir);

// ✅ Vercel expects you to export the app instead of listening
module.exports = app; // <-- this line replaces app.listen()
