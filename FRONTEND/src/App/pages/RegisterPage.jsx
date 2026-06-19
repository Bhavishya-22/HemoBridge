import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function RegisterPage() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleRegister = async () => {
    try {
      const response = await fetch("http://localhost:3000/auth/register", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, username, email, password }),
      });

      const data = await response.json();

      if (response.ok) {
        navigate("/profile");
      } else {
        setMessage(data.message);
      }
    } catch (error) {
      setMessage("Registration failed");
      console.error("Error:", error);
    }
  };

  return (
    <div style={{ marginTop: "100px" }}>
      <h1>Register Page</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleRegister();
        }}
      >
        <input
          type="text"
          placeholder="Enter Full Name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <br /><br />

        <input
          type="text"
          placeholder="Enter Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <br /><br />

        <input
          type="email"
          placeholder="Enter Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <br /><br />

        <input
          type="password"
          placeholder="Enter Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br /><br />

        <button type="submit">Register</button>
      </form>
      {message && <p>{message}</p>}
    </div>
  );
}
