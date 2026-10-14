package cn.xindong.core

import com.sun.net.httpserver.HttpServer
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import java.net.InetSocketAddress
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicReference

/** An actual loopback HTTP server exercises transport, not AI intelligence or real vendor billing. */
class HttpContractTest {
    private fun config(stream: Boolean=false) = ModelConfig(id="fixture",name="LOCAL_PROTOCOL_FIXTURE",endpoint="https://not-a-real-vendor.invalid/chat",model="fixture",
        apiKey="SYNTHETIC_TEST_KEY",contextTokens=65536,inputRmbPerMillion="1",outputRmbPerMillion="1",pricingSource="unit fixture only",pricingVerified=true,stream=stream)
    private val response="""{"model":"fixture-v1","choices":[{"finish_reason":"stop","message":{"content":"{\"fixture\":true}"}}],"usage":{"prompt_tokens":20,"completion_tokens":5}}"""
    private fun server(handler: (com.sun.net.httpserver.HttpExchange)->Unit, run: (HttpGateway)->Unit) {
        val server=HttpServer.create(InetSocketAddress("127.0.0.1",0),0); server.createContext("/fixture",handler); server.start()
        try { run(HttpGateway { URL("http://127.0.0.1:${server.address.port}/fixture").openConnection() as HttpURLConnection }) } finally { server.stop(0) }
    }
    @Test fun actualHttpPostContainsBearerJsonAndDeclaredOutputCap() {
        val request=AtomicReference<String>(); val auth=AtomicReference<String>()
        server({ exchange -> request.set(String(exchange.requestBody.readBytes())); auth.set(exchange.requestHeaders.getFirst("Authorization")); val bytes=response.toByteArray(); exchange.sendResponseHeaders(200,bytes.size.toLong()); exchange.responseBody.use { it.write(bytes) } }) { raw ->
            val ledger=Ledger(); val reply=ChargedGateway(raw,ledger,"fixture-owner").chat("fixture",config(),"JSON system","synthetic user",CancelToken())
            val payload=JSONObject(request.get()); assertEquals("Bearer SYNTHETIC_TEST_KEY",auth.get()); assertEquals(4096,payload.getInt("max_tokens")); assertEquals("json_object",payload.getJSONObject("response_format").getString("type"))
            assertEquals("JSON system",payload.getJSONArray("messages").getJSONObject(0).getString("content")); assertEquals(Usage(20,5),reply.usage); assertEquals("TOKEN_ESTIMATE",ledger.entries().single().state)
        }
    }
    @Test fun onlyKnownRateRejectionIsRetriedAndEachAttemptAudited() {
        val calls=AtomicInteger()
        server({ exchange -> val first=calls.incrementAndGet()==1; val bytes=if(first) "rate limited".toByteArray() else response.toByteArray(); exchange.sendResponseHeaders(if(first) 429 else 200,bytes.size.toLong()); exchange.responseBody.use { it.write(bytes) } }) { raw ->
            val ledger=Ledger(); ChargedGateway(raw,ledger,"fixture").chat("fixture",config(),"JSON","synthetic",CancelToken())
            assertEquals(2,calls.get()); assertEquals(listOf("REJECTED_NO_USAGE","TOKEN_ESTIMATE"),ledger.entries().map { it.state })
        }
    }
    @Test fun serverFailureWithUnknownBillingDoesNotRetryOrLeakErrorBody() {
        val calls=AtomicInteger(); val secret="SERVER_ERROR_PRIVATE_FIXTURE"
        server({ exchange -> calls.incrementAndGet(); val bytes=secret.toByteArray(); exchange.sendResponseHeaders(503,bytes.size.toLong()); exchange.responseBody.use { it.write(bytes) } }) { raw ->
            val ledger=Ledger()
            try { ChargedGateway(raw,ledger,"fixture").chat("fixture",config(),"JSON","synthetic",CancelToken()); fail("Must fail") }
            catch(e: ApiFailure) { assertFalse(e.message!!.contains(secret)) }
            assertEquals(1,calls.get()); assertEquals("UNCERTAIN",ledger.entries().single().state)
        }
    }
    @Test fun redirectsAreNeverFollowed() {
        server({ exchange -> exchange.responseHeaders.set("Location","https://example.invalid/steal"); exchange.sendResponseHeaders(307,-1); exchange.close() }) { raw ->
            try { raw.chat(config(),"JSON","fixture",CancelToken()); fail("Redirect must fail") } catch(e: ApiFailure) { assertEquals(307,e.status) }
        }
    }
    @Test fun realHttpSseParsesFinalUsage() {
        val request=AtomicReference<String>()
        val sse="data: {\"model\":\"fixture-v1\",\"choices\":[{\"delta\":{\"content\":\"{}\"},\"finish_reason\":null}]}\n\ndata: {\"model\":\"fixture-v1\",\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":2}}\n\ndata: [DONE]\n\n"
        server({ exchange -> request.set(String(exchange.requestBody.readBytes())); exchange.responseHeaders.set("Content-Type","text/event-stream"); val bytes=sse.toByteArray(); exchange.sendResponseHeaders(200,0); exchange.responseBody.use { it.write(bytes) } }) { raw ->
            val reply=raw.chat(config(true),"JSON","fixture",CancelToken()); assertEquals("{}",reply.text); assertEquals(Usage(7,2),reply.usage); assertTrue(JSONObject(request.get()).getJSONObject("stream_options").getBoolean("include_usage"))
        }
    }
    @Test fun actualJevProtocolAndNumericValidation() {
        val request=AtomicReference<String>(); val json="""{"model":"fixture-jev-v1","answers":{"boundary_respect":{"type":"noul","noul":0.7},"strategy":{"type":"choice","choice":"clarify"},"intensity":{"type":"score","score":1.2}},"usage":{"input_tokens":10,"output_tokens":3}}"""
        server({ exchange -> request.set(String(exchange.requestBody.readBytes())); val bytes=json.toByteArray(); exchange.sendResponseHeaders(200,bytes.size.toLong()); exchange.responseBody.use { it.write(bytes) } }) { raw ->
            val reply=raw.jev(config().copy(kind=ProviderKind.JEV),JSONObject().put("synthetic",true),CancelToken())
            val payload=JSONObject(request.get()); assertTrue(payload.has("state")); assertEquals("choice",payload.getJSONObject("questions").getJSONObject("strategy").getString("type")); assertEquals(Usage(10,3),reply.usage)
        }
    }
}
