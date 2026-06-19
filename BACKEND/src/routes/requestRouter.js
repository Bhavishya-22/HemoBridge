const express = require("express");

const requestController =
require("../controllers/requestController");

const acceptController =
require("../controllers/acceptController");

const authMiddleware =
require("../middlewares/authMiddleware");

const donorOnly =
require("../middlewares/donorOnlyMiddleware");

const requestRouter =
express.Router();

requestRouter.post(
  "/requests/create",
  authMiddleware,
  requestController.createRequest
);

requestRouter.get(
  "/requests/view",
  requestController.viewRequests
);

requestRouter.get(
  "/requests/my-requests",
  authMiddleware,
  requestController.myRequests
);

requestRouter.post(
  "/requests/accept/:id",
  authMiddleware,
  donorOnly,
  acceptController.acceptRequest
);

module.exports = requestRouter;