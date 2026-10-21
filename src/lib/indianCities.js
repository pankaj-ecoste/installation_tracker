/* ══ INDIAN CITIES (Visit Planner base city — plan.md v2-64) ══
   Select-only list, so the same city is always spelled the same way. Covers state capitals, every major
   metro/tier-2/tier-3 city and the towns the site team is likely to be based in. Sorted A–Z at load. */
const CITIES=[
  'Agartala','Agra','Ahmedabad','Ahmednagar','Aizawl','Ajmer','Akola','Alappuzha','Aligarh','Allahabad (Prayagraj)','Alwar','Ambala','Ambattur','Amravati','Amritsar','Anand','Anantapur','Asansol','Aurangabad','Ayodhya',
  'Bagalkot','Bareilly','Barasat','Bardhaman','Baroda (Vadodara)','Bathinda','Belgaum (Belagavi)','Bellary (Ballari)','Bengaluru','Bhagalpur','Bharuch','Bhavnagar','Bhilai','Bhilwara','Bhiwandi','Bhiwani','Bhopal','Bhubaneswar','Bhuj','Bikaner','Bilaspur','Bokaro Steel City',
  'Chandigarh','Chandrapur','Chennai','Chhindwara','Coimbatore','Cuttack',
  'Dabhol','Darbhanga','Davanagere','Dehradun','Delhi','New Delhi','Dhanbad','Dharwad','Dhule','Dibrugarh','Dimapur','Durg','Durgapur',
  'Eluru','Erode','Etawah',
  'Faridabad','Firozabad',
  'Gandhidham','Gandhinagar','Gangtok','Gaya','Ghaziabad','Goa (Panaji)','Gonda','Gorakhpur','Gulbarga (Kalaburagi)','Guntur','Gurugram','Guwahati','Gwalior',
  'Haldwani','Hapur','Haridwar','Hisar','Hosur','Hubli','Hyderabad',
  'Imphal','Indore','Itanagar',
  'Jabalpur','Jaipur','Jalandhar','Jalgaon','Jalna','Jammu','Jamnagar','Jamshedpur','Jhansi','Jodhpur','Junagadh',
  'Kakinada','Kalyan','Kanpur','Karnal','Karur','Kochi','Kohima','Kolhapur','Kolkata','Kollam','Korba','Kota','Kozhikode','Kurnool',
  'Latur','Lonavala','Lucknow','Ludhiana',
  'Madurai','Malegaon','Mangaluru','Mathura','Meerut','Mehsana','Mira Bhayandar','Moradabad','Morbi','Mumbai','Muzaffarnagar','Muzaffarpur','Mysuru',
  'Nagpur','Nanded','Nashik','Navi Mumbai','Nellore','Noida','Greater Noida',
  'Ongole',
  'Palghar','Panipat','Panvel','Parbhani','Patiala','Patna','Pimpri-Chinchwad','Pondicherry (Puducherry)','Pune',
  'Raebareli','Raichur','Raigarh','Raipur','Rajahmundry','Rajkot','Ranchi','Ratlam','Ratnagiri','Rewa','Rohtak','Roorkee','Rourkela',
  'Sagar','Saharanpur','Salem','Sambalpur','Sangli','Satara','Shillong','Shimla','Shivamogga','Sikar','Siliguri','Silvassa','Solapur','Sonipat','Srinagar','Surat','Surendranagar',
  'Thane','Thanjavur','Thiruvananthapuram','Thrissur','Tinsukia','Tiruchirappalli','Tirunelveli','Tirupati','Tiruppur','Tumakuru',
  'Udaipur','Ujjain','Ulhasnagar','Vapi','Varanasi','Vasai-Virar','Vellore','Vijayawada','Visakhapatnam','Vizianagaram',
  'Warangal','Wardha',
  'Yamunanagar','Yavatmal'
];
export const INDIAN_CITIES=[...new Set(CITIES)].sort((a,b)=>a.localeCompare(b));
