import type { Story } from "./content.types.js";

const photo = (id: string, width = 1400) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;

export const thailand: Story = {
  slug: "thailand",
  title: "Thailand",
  summary:
    "A river city and a mountain town. Temples in the morning, a canal in the late light, and a market breakfast before you leave.",
  coverUrl: photo("photo-1508009603885-50cf7c579365"),
  destination: {
    name: "Thailand",
    country: "Thailand",
    lat: 13.7563,
    lng: 100.5018,
  },
  creator: {
    username: "travelhues",
    displayName: "Asha",
    bio: "Asha writes slow routes through cities she goes back to. This Thailand story is the one she sends friends before they book the flight.",
    avatarUrl: photo("photo-1544005313-94ddf0286df2", 400),
  },
  spots: [
    {
      id: "river-room",
      type: "stay",
      title: "The River Room",
      description:
        "A low hotel on the Chao Phraya, a short walk from the temple ferries. Rooms face the water. Breakfast is on the terrace before the longtails get loud.",
      images: [photo("photo-1566073771259-6a8506099945")],
      lat: 13.7244,
      lng: 100.514,
      address: "Charoen Krung, Bangkok",
      avgMinutes: 0,
      avgCostThb: 11340,
      tags: ["riverside", "breakfast"],
    },
    {
      id: "nimman-house",
      type: "stay",
      title: "Nimman House",
      description:
        "A small guesthouse off Nimmanhaemin. Bikes in the courtyard, coffee on the next corner, and a quiet lane after ten.",
      images: [photo("photo-1520250497591-112f2f40a3f4")],
      lat: 18.7974,
      lng: 98.9678,
      address: "Nimmanhaemin, Chiang Mai",
      avgMinutes: 0,
      avgCostThb: 4860,
      tags: ["guesthouse", "bikes"],
    },
    {
      id: "yaowarat-stall",
      type: "food",
      title: "Yaowarat oyster stall",
      description:
        "A sidewalk stall on Yaowarat with a charcoal grill and two plastic stools. Order the oysters and a plate of noodles, then keep walking.",
      images: [photo("photo-1559339352-11d035aa65de")],
      lat: 13.7404,
      lng: 100.5101,
      address: "Yaowarat Road, Bangkok",
      avgMinutes: 45,
      avgCostThb: 756,
      tags: ["street food", "night"],
    },
    {
      id: "warorot-breakfast",
      type: "food",
      title: "Warorot morning bowl",
      description:
        "Inside Chiang Mai’s oldest market, a stall ladles rice porridge and sells warm soy milk before the spice shops open.",
      images: [photo("photo-1542838132-92c53300491e")],
      lat: 18.7906,
      lng: 99.0012,
      address: "Warorot Market, Chiang Mai",
      avgMinutes: 40,
      avgCostThb: 216,
      tags: ["breakfast", "market"],
    },
    {
      id: "khlong-boat",
      type: "activity",
      title: "Khlong longtail",
      description:
        "A late-afternoon longtail through the Thonburi canals. The driver slows at the orchid houses and turns back as the river goes gold.",
      images: [photo("photo-1552465011-b4e21bf6e79a")],
      lat: 13.739,
      lng: 100.488,
      address: "Thonburi canals, Bangkok",
      avgMinutes: 90,
      avgCostThb: 3240,
      tags: ["boat", "afternoon"],
    },
    {
      id: "cooking-class",
      type: "activity",
      title: "Wualai cooking table",
      description:
        "A half day south of the old city. You shop the lane market first, then cook tom kha and a curry at a shared table.",
      images: [photo("photo-1556910103-1c02745aae4d")],
      lat: 18.777,
      lng: 98.985,
      address: "Wualai Road, Chiang Mai",
      avgMinutes: 240,
      avgCostThb: 4050,
      tags: ["class", "market"],
    },
    {
      id: "wat-arun",
      type: "sightseeing",
      title: "Wat Arun",
      description:
        "The temple of dawn, across the river from the palace district. Climb the central prang in the morning, before the heat sits on the steps.",
      images: [photo("photo-1528183429752-a97d0bf99b5a")],
      lat: 13.7437,
      lng: 100.4889,
      address: "Wat Arun, Bangkok",
      avgMinutes: 90,
      avgCostThb: 540,
      tags: ["temple", "morning"],
    },
    {
      id: "doi-suthep",
      type: "sightseeing",
      title: "Doi Suthep",
      description:
        "The mountain temple above Chiang Mai. On a clear morning the terrace looks over the whole valley. The viewpoint is up the naga stairs, not the car park.",
      images: [photo("photo-1598977123118-4e30ba3c4f5b")],
      lat: 18.8048,
      lng: 98.9217,
      address: "Doi Suthep, Chiang Mai",
      avgMinutes: 120,
      avgCostThb: 216,
      tags: ["viewpoint", "mountain"],
    },
    {
      id: "wat-chedi-luang",
      type: "sightseeing",
      title: "Wat Chedi Luang",
      description:
        "The ruined chedi in the old city, still tall enough to hold the square. Evening chanting carries into the courtyard.",
      images: [photo("photo-1519451241324-20b4ea2c4220")],
      lat: 18.7869,
      lng: 98.9866,
      address: "Old City, Chiang Mai",
      avgMinutes: 45,
      avgCostThb: 135,
      tags: ["temple", "evening"],
    },
    {
      id: "chatuchak-run",
      type: "shop",
      title: "Chatuchak stall run",
      description:
        "A planned loop through the weekend market: ceramics, then cotton, then out before the bag gets heavy. Cash moves faster than a card here.",
      images: [photo("photo-1555529669-e69e7aa0ba9a")],
      lat: 13.7999,
      lng: 100.5508,
      address: "Chatuchak Weekend Market, Bangkok",
      avgMinutes: 150,
      avgCostThb: 4050,
      tags: ["market", "weekend"],
    },
  ],
  itineraries: [
    {
      slug: "thailand-in-4-days",
      title: "Thailand in 4 days",
      summary:
        "Bangkok on the river, then a short flight north. City mornings, one canal afternoon, and a mountain terrace before you leave Chiang Mai.",
      coverUrl: photo("photo-1528183429752-a97d0bf99b5a"),
      days: [
        {
          title: "Bangkok, on the river",
          blocks: [
            {
              kind: "note",
              body: "Land at Suvarnabhumi. A taxi to the river takes about 45 minutes if you leave the airport before four.",
            },
            {
              kind: "spot",
              spotId: "river-room",
              body: "Check in after two. Ask for a room that faces the water, not the lane.",
            },
            {
              kind: "spot",
              spotId: "wat-arun",
              body: "Go before eight, while the steps are still in shade.",
            },
            {
              kind: "spot",
              spotId: "yaowarat-stall",
              body: "Eat here after dark. Stand if the stools are taken.",
            },
          ],
        },
        {
          title: "Canals and the market",
          blocks: [
            {
              kind: "spot",
              spotId: "khlong-boat",
              body: "Book the four o’clock boat so you come back at dusk.",
            },
            {
              kind: "note",
              body: "Chatuchak is a weekend market. On a weekday, walk Pak Khlong flower market instead and keep the evening free.",
            },
            {
              kind: "spot",
              spotId: "chatuchak-run",
              body: "Carry cash. Leave when the bag feels heavy.",
            },
            {
              kind: "spot",
              spotId: "river-room",
              body: "Last night on the river. The terrace is quieter after nine.",
            },
          ],
        },
        {
          title: "North to Chiang Mai",
          blocks: [
            {
              kind: "note",
              body: "Fly Bangkok to Chiang Mai, about an hour and fifteen minutes. A car from the airport to Nimman takes around twenty minutes.",
            },
            {
              kind: "spot",
              spotId: "nimman-house",
              body: "Drop the bags and walk the lane before dinner. The gate locks at midnight.",
            },
            {
              kind: "spot",
              spotId: "wat-chedi-luang",
              body: "Come at dusk for the courtyard. This is a short visit, not a tour.",
            },
          ],
        },
        {
          title: "Market, then the mountain",
          blocks: [
            {
              kind: "spot",
              spotId: "warorot-breakfast",
              body: "Go when the market opens, around seven.",
            },
            {
              kind: "spot",
              spotId: "doi-suthep",
              body: "Take a songthaew from the zoo gate. The view is the terrace at the top of the stairs.",
            },
            {
              kind: "note",
              body: "The cooking class includes lunch, so don’t eat a second meal on the way down.",
            },
            {
              kind: "spot",
              spotId: "cooking-class",
              body: "The class starts in the lane market. Wear shoes you can stand in.",
            },
          ],
        },
      ],
    },
    {
      slug: "chiang-mai-2-days",
      title: "Chiang Mai, 2 days",
      summary:
        "A short stay in the old city and on the mountain, using the same places as the longer trip.",
      coverUrl: photo("photo-1598977123118-4e30ba3c4f5b"),
      days: [
        {
          title: "Old city evening",
          blocks: [
            {
              kind: "note",
              body: "Arrive into Chiang Mai and go to Nimman before the evening traffic on the canal road.",
            },
            {
              kind: "spot",
              spotId: "nimman-house",
              body: "The courtyard bikes are free until dusk.",
            },
            {
              kind: "spot",
              spotId: "wat-chedi-luang",
              body: "Walk the square after the heat drops.",
            },
            {
              kind: "spot",
              spotId: "cooking-class",
              body: "If the class is full, the same lane has dinner stalls.",
            },
          ],
        },
        {
          title: "Breakfast and the viewpoint",
          blocks: [
            {
              kind: "spot",
              spotId: "warorot-breakfast",
              body: "Eat before you wander the spice aisles.",
            },
            {
              kind: "spot",
              spotId: "doi-suthep",
              body: "Morning light on the terrace, then back down before noon.",
            },
            {
              kind: "note",
              body: "Songthaews back to the old city leave from the temple car park when they fill.",
            },
          ],
        },
      ],
    },
  ],
  blogs: [],
};
