import { useState } from "react";

export default function ProfilePage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [bloodGroup, setBloodGroup] = useState("");
  const [age, setAge] = useState("");
  const [weight, setWeight] = useState("");
  const [role, setRole] = useState("donor");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [diseases, setDiseases] = useState("");

  return (
    <div style={{ marginTop: "100px" }}>
      <h1>Complete Your Profile</h1>

      <input
        type="text"
        placeholder="Phone Number"
        value={phoneNumber}
        onChange={(e) => setPhoneNumber(e.target.value)}
      />

      <br />
      <br />

      <select
        value={bloodGroup}
        onChange={(e) => setBloodGroup(e.target.value)}
      >
        <option value="">Select Blood Group</option>
        <option value="A+">A+</option>
        <option value="A-">A-</option>
        <option value="B+">B+</option>
        <option value="B-">B-</option>
        <option value="AB+">AB+</option>
        <option value="AB-">AB-</option>
        <option value="O+">O+</option>
        <option value="O-">O-</option>
      </select>

      <br />
      <br />

      <input
        type="number"
        placeholder="Age"
        value={age}
        onChange={(e) => setAge(e.target.value)}
      />

      <br />
      <br />

      <input
        type="number"
        placeholder="Weight (kg)"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
      />

      <br />
      <br />

      <select value={role} onChange={(e) => setRole(e.target.value)}>
        <option value="donor">Donor</option>
        <option value="receiver">Receiver</option>
        <option value="hospital">Hospital</option>
      </select>

      <br />
      <br />

      <input
        type="text"
        placeholder="City"
        value={city}
        onChange={(e) => setCity(e.target.value)}
      />

      <br />
      <br />

      <input
        type="text"
        placeholder="State"
        value={state}
        onChange={(e) => setState(e.target.value)}
      />

      <br />
      <br />

      <input
        type="text"
        placeholder="Diseases (comma separated)"
        value={diseases}
        onChange={(e) => setDiseases(e.target.value)}
      />

      <br />
      <br />

      <button
        onClick={() => {
          console.log({
            phoneNumber,
            bloodGroup,
            age,
            weight,
            diseases: diseases.split(","),
            location: {
              city,
              state,
            },
            role,
          });
        }}
      >
        Save Profile
      </button>
    </div>
  );
}