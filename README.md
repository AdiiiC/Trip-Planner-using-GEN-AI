# 🗺️ AI Trip Planner using LangGraph & Groq

An intelligent, stateful travel concierge built with **GenAI**. This application generates detailed, realistic, and time-blocked trip itineraries based on your specific preferences. It utilizes an AI agent workflow to not only create the initial plan but also refine it based on your feedback.

Built with **LangChain**, **LangGraph**, **Gradio**, and powered by **Llama 3.3 (70B)** via **Groq** for lightning-fast inference.

## ✨ Features

* **Highly Customized Itineraries:** Tailors trips based on destination, number of days, specific interests, budget, travel style, and dietary requirements.
* **Interactive Refinement Loop:** Don't like a specific restaurant or activity? Use the feedback box to tell the AI what to change, and LangGraph will seamlessly revise the itinerary while keeping the parts you like (up to 3 refinement loops).
* **Detailed Scheduling:** Provides time-blocked activities, estimated costs in USD, practical local tips, and a packing/logistics guide.
* **Sleek Web Interface:** Includes a built-in Gradio UI for a smooth, interactive user experience.

## 🛠️ Tech Stack

* **LLM:** [Groq](https://groq.com/) (Llama-3.3-70b-versatile)
* **Orchestration:** LangChain & LangGraph
* **UI:** Gradio
* **Data Validation:** Pydantic

## 🚀 Getting Started

### Prerequisites
* Python 3.9+
* A Groq API Key. **You can go to the [official Groq website](https://console.groq.com/) and create one for free.**

### Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/yourusername/ai-trip-planner.git](https://github.com/yourusername/ai-trip-planner.git)
   cd ai-trip-planner
