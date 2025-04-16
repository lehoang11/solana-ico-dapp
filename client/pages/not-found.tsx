

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <h1 className="text-4xl font-bold text-gray-800">
        404 - Page Not Found
      </h1>
      <p className="mt-4 text-gray-600">
        Sorry, the page you are looking for does not exist.
      </p>
      <p className="mt-2 text-gray-600">
        You can go back to the <a href="/" className="text-blue-500 hover:underline">home page</a>.
      </p>
    </div>
  );
}
